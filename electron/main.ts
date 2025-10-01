import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeDiff } from './services/codeAnalyzer';
import { scoreProgress, scoreFromFeatures } from './services/progressScorer';
import { extractDiffFeatures } from './services/diffFeatures';
import { summarizeWithAI } from './services/aiSummarizer';
import { Storage } from './services/storage';
import { getConfig, setConfig } from './services/config';
import { TrackerService } from './services/tracker';
import { StatsService } from './services/stats';
import { GitAnalyzer } from './services/gitAnalyzer';
import { DB } from './services/db_sqljs';
import { db } from './services/dbInstance';
import { todayKey } from './services/dateUtil';
import { calcProgressPercentByPrevLocal } from './services/progressCalculator';
import { generateTodaySummary, buildTodayUnifiedDiff } from './services/summaryService';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const storage = new Storage();
const tracker = new TrackerService();
const stats = new StatsService();

let win: BrowserWindow | null = null;

// --- Simple background job state for today's summary ---
type JobStatus = {
  id: string;
  type: 'today-summary';
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number; // 0..100
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  result?: { 
    date: string; 
    summary: string; 
    scoreAi: number; 
    scoreLocal: number; 
    progressPercent: number; 
    featuresSummary: string;
    aiModel?: string | null;
    aiProvider?: string | null;
    aiTokens?: number | null;
    aiDurationMs?: number | null;
    chunksCount?: number | null;
    lastGenAt?: number | null;
  };
};
let summaryJob: JobStatus = { id: 'today', type: 'today-summary', status: 'idle', progress: 0 };

function emitSummaryProgress(p: number) {
  summaryJob.progress = Math.max(0, Math.min(100, Math.round(p)));
  if (win) {
    try { win.webContents.send('summary:job:progress', { id: summaryJob.id, progress: summaryJob.progress, status: summaryJob.status }); } catch {}
  }
}

async function runTodaySummaryJob(): Promise<JobStatus['result']> {
  // This reuses the logic of summary:todayDiff handler below (kept in sync)
  summaryJob.status = 'running';
  summaryJob.startedAt = Date.now();
  emitSummaryProgress(1);
  // Preparation done
  emitSummaryProgress(10);
  // Delegate to SummaryService with chunked progress mapping
  const res = await generateTodaySummary({
    onProgress: (done, total) => {
      const base = 20; // after preparation
      const span = 75; // 20 -> 95
      const pct = base + Math.floor((span * done) / Math.max(1, total));
      emitSummaryProgress(Math.min(95, Math.max(20, pct)));
    }
  });
  emitSummaryProgress(100);
  return {
    date: res.date,
    summary: res.summary,
    scoreAi: res.scoreAi,
    scoreLocal: res.scoreLocal,
    progressPercent: res.progressPercent,
    featuresSummary: res.featuresSummary,
    aiModel: res.model,
    aiProvider: res.provider,
    aiTokens: res.tokens,
    aiDurationMs: res.durationMs,
    chunksCount: res.chunksCount,
    lastGenAt: res.lastGenAt,
  };
}

// IPC: background job controls
ipcMain.handle('summary:job:start', async () => {
  if (summaryJob.status === 'running') {
    return { ok: true, job: summaryJob };
  }
  summaryJob = { id: 'today', type: 'today-summary', status: 'running', progress: 0, startedAt: Date.now() };
  // Fire-and-forget: don't block the IPC reply
  (async () => {
    try {
      const res = await runTodaySummaryJob();
      summaryJob.result = res;
      summaryJob.status = 'done';
      summaryJob.finishedAt = Date.now();
      emitSummaryProgress(100);
    } catch (e: any) {
      summaryJob.status = 'error';
      summaryJob.error = e?.message || String(e);
      summaryJob.finishedAt = Date.now();
      emitSummaryProgress(summaryJob.progress || 0);
    }
  })();
  return { ok: true, job: summaryJob };
});

ipcMain.handle('summary:job:status', async () => {
  return summaryJob;
});

async function createWindow() {
  // Resolve preload path (.js in dev/build, sometimes .cjs depending on bundler)
  const preloadJs = path.join(__dirname, 'preload.js');
  const preloadCjs = path.join(__dirname, 'preload.cjs');
  const preloadMjs = path.join(__dirname, 'preload.mjs');
  // Prefer .cjs (our esbuild target) to avoid accidentally picking up stale .js
  const preloadPath = [preloadCjs, preloadJs, preloadMjs].find(p => fs.existsSync(p)) || preloadCjs;

  win = new BrowserWindow({
    width: 1100,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#cbd5e1',
      height: 36,
    },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Hide application menu and native menu bar
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  // Forward maximize state changes to renderer
  win.on('maximize', () => {
    win?.webContents.send('window:maximize-changed', true);
  });
  win.on('unmaximize', () => {
    win?.webContents.send('window:maximize-changed', false);
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      await win.loadFile(indexPath);
    } else {
      await win.loadURL('data:text/html,<h1>Build not found</h1>');
    }
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.handle('analyze:diff', async (_evt, payload: { before: string; after: string }) => {
  try {
    const diff = analyzeDiff(payload.before, payload.after);
    const score = scoreProgress(diff);
    let summary = '';
    try {
      summary = await summarizeWithAI(diff, score);
    } catch (e) {
      summary = `AI 总结失败：${(e as Error).message}`;
    }

    const record = { timestamp: Date.now(), score, summary };
    await storage.append(record);
    return { score, summary };
  } catch (err: any) {
    throw new Error(err?.message || '分析失败');
  }
});

ipcMain.handle('history:get', async () => {
  const items = await storage.getAll();
  // Group by local date (YYYY-MM-DD), pick the latest entry of each day
  const byDay = new Map<string, typeof items[number]>();
  for (const it of items) {
    const d = new Date(it.timestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const prev = byDay.get(key);
    if (!prev || it.timestamp > prev.timestamp) byDay.set(key, it);
  }
  // Sort by day ascending and return array
  const aggregated = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, it]) => it);
  return aggregated;
});

ipcMain.handle('config:get', async () => {
  return getConfig();
});

ipcMain.handle('config:set', async (_evt, cfg: { openaiApiKey?: string; repoPath?: string }) => {
  return setConfig(cfg);
});

// Select a local folder
ipcMain.handle('dialog:selectFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});

// Tracking controls
ipcMain.handle('tracking:start', async (_evt, payload: { repoPath?: string; intervalMs?: number }) => {
  await tracker.start(payload?.repoPath, payload?.intervalMs);
  return tracker.status();
});

ipcMain.handle('tracking:stop', async () => {
  tracker.stop();
  return tracker.status();
});

ipcMain.handle('tracking:status', async () => {
  return tracker.status();
});

// Stats & Summary (SQLite-backed)
ipcMain.handle('stats:getToday', async () => {
  // Read from shared DB instance to reflect latest writes
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const row = await db.getDay(today);
  if (row) return row;
  return {
    date: today,
    insertions: 0,
    deletions: 0,
    baseScore: 100,
    trend: 0,
    summary: null,
    aiScore: null,
    localScore: null,
    progressPercent: null,
    aiModel: null,
    aiProvider: null,
    aiTokens: null,
    aiDurationMs: null,
    chunksCount: null,
    lastGenAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
});

ipcMain.handle('stats:getRange', async (_evt, payload: { startDate: string; endDate: string }) => {
  return db.getDaysRange(payload.startDate, payload.endDate);
});

ipcMain.handle('summary:generate', async () => {
  return stats.generateOnDemandSummary();
});

// Manual one-shot analyze (no timers)
ipcMain.handle('tracking:analyzeOnce', async (_evt, payload: { repoPath?: string }) => {
  const st = await tracker.analyzeOnce(payload?.repoPath);
  return st;
});

// Summarize today's concrete code changes via unified diff
ipcMain.handle('summary:todayDiff', async () => {
  const res = await generateTodaySummary();
  return {
    date: res.date,
    summary: res.summary,
    scoreAi: res.scoreAi,
    scoreLocal: res.scoreLocal,
    progressPercent: res.progressPercent,
    featuresSummary: res.featuresSummary,
    aiModel: res.model,
    aiProvider: res.provider,
    aiTokens: res.tokens,
    aiDurationMs: res.durationMs,
    chunksCount: res.chunksCount,
    lastGenAt: res.lastGenAt,
  };
});

// Return today's unified diff text for in-app visualization
ipcMain.handle('diff:today', async () => {
  return buildTodayUnifiedDiff();
});

// Totals across all days
ipcMain.handle('stats:getTotals', async () => {
  return db.getTotals();
});

// Live Git-based today's insertions/deletions (includes working tree)
ipcMain.handle('stats:getTodayLive', async () => {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const ns = await git.getNumstatSinceDate(today);
  // Persist to DB for real-time baseScore/trend
  try {
    await db.setDayCounts(today, ns.insertions, ns.deletions);
    // If AI/local scores already exist, recompute baseScore with hybrid metrics immediately
    try {
      const row = await db.getDay(today);
      if (row && (typeof row.aiScore === 'number' || typeof row.localScore === 'number')) {
        await db.setDayMetrics(today, { aiScore: row.aiScore ?? undefined, localScore: row.localScore ?? undefined, progressPercent: row.progressPercent ?? undefined });
      }
    } catch {}
  } catch {}
  const total = Math.max(0, (ns.insertions || 0)) + Math.max(0, (ns.deletions || 0));
  return { date: today, insertions: ns.insertions, deletions: ns.deletions, total };
});

// Live totals: adjust DB totals by replacing today's DB counts with live Git counts
ipcMain.handle('stats:getTotalsLive', async () => {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const totals = await db.getTotals();
  const todayRow = await db.getDay(today);
  const live = await git.getNumstatSinceDate(today);
  const dbTodayIns = todayRow?.insertions || 0;
  const dbTodayDel = todayRow?.deletions || 0;
  const adjIns = Math.max(0, (totals.insertions || 0) - dbTodayIns + live.insertions);
  const adjDel = Math.max(0, (totals.deletions || 0) - dbTodayDel + live.deletions);
  return { insertions: adjIns, deletions: adjDel, total: adjIns + adjDel };
});

// Window control handlers
ipcMain.handle('window:minimize', async () => {
  win?.minimize();
});

ipcMain.handle('window:toggleMaximize', async () => {
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});

ipcMain.handle('window:isMaximized', async () => {
  return win?.isMaximized() ?? false;
});

ipcMain.handle('window:close', async () => {
  win?.close();
});
