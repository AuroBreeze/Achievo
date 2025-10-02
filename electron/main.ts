import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { analyzeDiff } from './services/codeAnalyzer';
import { scoreProgress } from './services/progressScorer';
import { summarizeWithAI } from './services/aiSummarizer';
import { Storage } from './services/storage';
import { getConfig, setConfig } from './services/config';
import { TrackerService } from './services/tracker';
import { StatsService } from './services/stats';
import { DB } from './services/db_sqljs';
import { generateTodaySummary, buildTodayUnifiedDiff } from './services/summaryService';
import { JobManager } from './services/jobManager';
import { createMainWindow } from './services/window';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const storage = new Storage();
const tracker = new TrackerService();
const stats = new StatsService();

// Local DB instance (replaces singleton usage)
const dbInstance = new DB();

let win: BrowserWindow | null = null;

// --- Background job manager for today's summary ---
const jobManager = new JobManager();
// Forward job progress to renderer
jobManager.onProgress((job) => {
  if (win) {
    try { win.webContents.send('summary:job:progress', { id: job.id, progress: job.progress, status: job.status }); } catch {}
  }
});

// IPC: background job controls
ipcMain.handle('summary:job:start', async () => {
  const job = await jobManager.startTodaySummaryJob(async (onChunk) => {
    const res = await generateTodaySummary({ onProgress: onChunk }, { db: dbInstance });
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
  return { ok: true, job };
});

ipcMain.handle('summary:job:status', async () => {
  return jobManager.getTodayJobStatus();
});

async function createWindow() {
  win = createMainWindow({ isDev, devUrl: process.env.VITE_DEV_SERVER_URL || undefined });
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
  const row = await dbInstance.getDay(today);
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
  return dbInstance.getDaysRange(payload.startDate, payload.endDate);
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
  const res = await generateTodaySummary(undefined, { db: dbInstance });
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
  return buildTodayUnifiedDiff({ db: dbInstance });
});

// Totals across all days
ipcMain.handle('stats:getTotals', async () => {
  return dbInstance.getTotals();
});

// Live Git-based today's insertions/deletions (includes working tree)
ipcMain.handle('stats:getTodayLive', async () => {
  return stats.getTodayLive();
});

// Live totals: adjust DB totals by replacing today's DB counts with live Git counts
ipcMain.handle('stats:getTotalsLive', async () => {
  return stats.getTotalsLive();
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
