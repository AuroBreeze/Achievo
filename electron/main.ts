import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeDiff } from './services/codeAnalyzer';
import { scoreProgress, scoreFromFeatures } from './services/progressScorer';
import { extractDiffFeatures } from './services/diffFeatures';
import { summarizeWithAI, summarizeUnifiedDiff, summarizeUnifiedDiffChunked } from './services/aiSummarizer';
import { Storage } from './services/storage';
import { getConfig, setConfig } from './services/config';
import { TrackerService } from './services/tracker';
import { StatsService } from './services/stats';
import { GitAnalyzer } from './services/gitAnalyzer';
import { DB } from './services/db_sqljs';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const storage = new Storage();
const tracker = new TrackerService();
const stats = new StatsService();
const db = new DB();

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
  result?: { date: string; summary: string; scoreAi: number; scoreLocal: number; progressPercent: number; featuresSummary: string };
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

  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  // Preparation done
  emitSummaryProgress(10);

  const diff = await git.getUnifiedDiffSinceDate(today);
  const feats = extractDiffFeatures(diff);
  const localScore = scoreFromFeatures(feats);
  // Features & local score ready
  emitSummaryProgress(20);

  let prevBase = 0;
  let prevLocal = 0;
  try {
    const y = db.getYesterday(today);
    if (y) {
      const prev = await db.getDay(y);
      prevBase = prev?.baseScore || 0;
      prevLocal = typeof prev?.localScore === 'number' ? (prev.localScore as number) : 0;
    }
  } catch {}

  const ns = await git.getNumstatSinceDate(today);
  let summaryRes: { text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number };
  try {
    summaryRes = await summarizeUnifiedDiffChunked(diff, {
      insertions: ns.insertions,
      deletions: ns.deletions,
      prevBaseScore: prevBase,
      localScore,
      features: feats,
      onProgress: (done, total) => {
        // Map chunk progress to 20%..95%
        const base = 20; // after preparation
        const span = 75; // 20 -> 95
        const pct = base + Math.floor((span * done) / Math.max(1, total));
        emitSummaryProgress(Math.min(95, Math.max(20, pct)));
      },
    });
  } catch {
    summaryRes = await summarizeUnifiedDiff(diff, { insertions: ns.insertions, deletions: ns.deletions, prevBaseScore: prevBase, localScore, features: feats });
  }
  // AI response received, moving to persistence
  emitSummaryProgress(96);

  let aiScore = 0;
  let markdown = '';
  try {
    const obj = JSON.parse(summaryRes.text);
    aiScore = Math.max(0, Math.min(100, Number(obj?.score_ai ?? obj?.score) || 0));
    markdown = String(obj?.markdown || '');
  } catch {
    markdown = summaryRes.text || '';
  }

  // Scheme B: compare against yesterday's localScore (same 0..100 scale)
  const denomB = Math.max(1, prevLocal || 50); // default baseline=50 for first day or missing
  let progressPercent = Math.round(((localScore - denomB) / denomB) * 100);
  if (progressPercent > 25) progressPercent = 25;

  try { await db.setDayCounts(today, ns.insertions, ns.deletions); } catch {}
  try {
    const existed = await db.getDay(today);
    if (!existed) await db.upsertDayAccumulate(today, 0, 0);
    if (markdown) await db.setDaySummary(today, markdown);
    await db.updateAggregatesForDate(today);
  } catch {}
  try {
    await db.setDayMetrics(today, { aiScore, localScore, progressPercent });
    const estTokens = (typeof summaryRes.tokens === 'number' && summaryRes.tokens > 0)
      ? summaryRes.tokens
      : Math.max(1, Math.round((markdown?.length || 0) / 4));
    await db.setDayAiMeta(today, {
      aiModel: summaryRes.model || undefined,
      aiProvider: summaryRes.provider || undefined,
      aiTokens: estTokens,
      aiDurationMs: typeof summaryRes.durationMs === 'number' ? summaryRes.durationMs : undefined,
      chunksCount: typeof summaryRes.chunksCount === 'number' ? summaryRes.chunksCount : undefined,
      lastGenAt: Date.now(),
    });
    const record = { timestamp: Date.now(), score: aiScore, summary: markdown || '（无内容）' };
    await storage.append(record);
  } catch {}

  const featuresSummary = `代码文件:${feats.codeFiles} 测试:${feats.testFiles} 文档:${feats.docFiles} 配置:${feats.configFiles} Hunk:${feats.hunks} 重命名:${feats.renameOrMove} 语言:${Object.keys(feats.languages||{}).join('+')||'-'} 依赖变更:${feats.dependencyChanges?'是':'否'} 安全敏感:${feats.hasSecuritySensitive?'是':'否'}`;
  emitSummaryProgress(100);
  return { date: today, summary: markdown, scoreAi: aiScore, scoreLocal: localScore, progressPercent, featuresSummary };
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
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  // Use LOCAL date (YYYY-MM-DD)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  // Build unified diff and semantic features first
  const diff = await git.getUnifiedDiffSinceDate(today);
  const feats = extractDiffFeatures(diff);
  // Local semantic score
  const localScore = scoreFromFeatures(feats);
  // Previous baseline
  let prevBase = 0;
  let prevLocal = 0;
  try {
    const y = db.getYesterday(today);
    if (y) {
      const prev = await db.getDay(y);
      prevBase = prev?.baseScore || 0;
      prevLocal = typeof prev?.localScore === 'number' ? (prev.localScore as number) : 0;
    }
  } catch {}

  // Summarize with AI and pass context metrics
  // Also compute git numstat for persistence below
  const ns = await git.getNumstatSinceDate(today);
  // Prefer chunked summarization to avoid context overflow; fallback to single-shot
  let summaryRes: { text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number };
  try {
    summaryRes = await summarizeUnifiedDiffChunked(diff, { insertions: ns.insertions, deletions: ns.deletions, prevBaseScore: prevBase, localScore, features: feats });
  } catch {
    summaryRes = await summarizeUnifiedDiff(diff, { insertions: ns.insertions, deletions: ns.deletions, prevBaseScore: prevBase, localScore, features: feats });
  }
  let aiScore = 0;
  let markdown = '';
  try {
    const obj = JSON.parse(summaryRes.text);
    aiScore = Math.max(0, Math.min(100, Number(obj?.score_ai ?? obj?.score) || 0));
    markdown = String(obj?.markdown || '');
  } catch {
    // 回退：若不是 JSON，则当作纯文本 markdown 处理
    markdown = summaryRes.text || '';
  }

  // Compute progress percent vs yesterday localScore (Scheme B)
  const denomB = Math.max(1, prevLocal || 50);
  let progressPercent = Math.round(((localScore - denomB) / denomB) * 100);
  if (progressPercent > 25) progressPercent = 25;

  // Save counts, ensure row, save markdown and AI base score
  try {
    await db.setDayCounts(today, ns.insertions, ns.deletions);
  } catch {}
  try {
    const existed = await db.getDay(today);
    if (!existed) await db.upsertDayAccumulate(today, 0, 0);
    if (markdown) await db.setDaySummary(today, markdown);
    // Do NOT overwrite cumulative baseScore with AI score; keep baseScore monotonic
    await db.updateAggregatesForDate(today);
  } catch {}

  // Persist metrics and append to history
  try {
    await db.setDayMetrics(today, { aiScore, localScore, progressPercent });
    // persist AI meta & generation info
    const estTokens = (typeof summaryRes.tokens === 'number' && summaryRes.tokens > 0)
      ? summaryRes.tokens
      : Math.max(1, Math.round((markdown?.length || 0) / 4));
    await db.setDayAiMeta(today, {
      aiModel: summaryRes.model || undefined,
      aiProvider: summaryRes.provider || undefined,
      aiTokens: estTokens,
      aiDurationMs: typeof summaryRes.durationMs === 'number' ? summaryRes.durationMs : undefined,
      chunksCount: typeof summaryRes.chunksCount === 'number' ? summaryRes.chunksCount : undefined,
      lastGenAt: Date.now(),
    });
    const record = { timestamp: Date.now(), score: aiScore, summary: markdown || '（无内容）' };
    await storage.append(record);
  } catch {}

  const featuresSummary = `代码文件:${feats.codeFiles} 测试:${feats.testFiles} 文档:${feats.docFiles} 配置:${feats.configFiles} Hunk:${feats.hunks} 重命名:${feats.renameOrMove} 语言:${Object.keys(feats.languages||{}).join('+')||'-'} 依赖变更:${feats.dependencyChanges?'是':'否'} 安全敏感:${feats.hasSecuritySensitive?'是':'否'}`;
  return { date: today, summary: markdown, scoreAi: aiScore, scoreLocal: localScore, progressPercent, featuresSummary };
});

// Return today's unified diff text for in-app visualization
ipcMain.handle('diff:today', async () => {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const diff = await git.getUnifiedDiffSinceDate(today);
  return { date: today, diff };
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
