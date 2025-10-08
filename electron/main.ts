import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { analyzeDiff } from './services/codeAnalyzer';
import { scoreProgress } from './services/progressScorer';
import { summarizeWithAI } from './services/aiSummarizer';
import { Storage } from './services/storage';
import { getConfig, setConfig } from './services/config';
import { TrackerService } from './services/tracker';
import { StatsService } from './services/stats';
import { DB } from './services/db_sqljs';
import { generateTodaySummary, buildTodayUnifiedDiff } from './services/summaryService';
import { PeriodSummaryService } from './services/periodSummaryService';
import { JobManager } from './services/jobManager';
import { createMainWindow } from './services/window';
import { applyLoggerConfig, setLogFile, getLogger } from './services/logger';
import path from 'node:path';
import fs from 'node:fs';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const storage = new Storage();
// Tracker manages its own per-repo DB binding internally
const tracker = new TrackerService();

// Local DB instance defined above

let win: BrowserWindow | null = null;
// Shared DB instance cache per current repo to avoid reloading file repeatedly and reduce race windows
let sharedDb: DB | null = null;
let sharedRepoPath: string | null = null;
async function getSharedDb(): Promise<DB> {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!sharedDb || sharedRepoPath !== repo) {
    sharedDb = new DB({ repoPath: repo });
    sharedRepoPath = repo || null;
  }
  return sharedDb;
}

// --- Background job manager for today's summary ---
const jobManager = new JobManager();
// Forward job progress to renderer
jobManager.onProgress((job) => {
  if (win) {
    try { win.webContents.send('summary:job:progress', { id: job.id, progress: job.progress, status: job.status }); } catch {}
  }
});

// Shared helper: auto-save today's data atomically, merging maxima and pausing tracker
async function autoSaveTodayInternal(payload?: { summary?: string; aiScore?: number; localScore?: number; progressPercent?: number }) {
  const wasRunning = (await tracker.status()).running;
  if (wasRunning) { try { tracker.stop(); } catch {} }
  try {
    const cfg = await getConfig();
    const repo = cfg.repoPath;
    if (!repo) throw new Error('未设置仓库路径');
    const db = new DB({ repoPath: repo });
    const { GitAnalyzer } = require('./services/gitAnalyzer');
    const git = new GitAnalyzer(repo);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const ns = await git.getNumstatSinceDate(today);
    // Apply in one batched call with maxima merge and overwriteToday for authoritative recompute
    await db.applyTodayUpdate(today, {
      counts: { insertions: ns.insertions, deletions: ns.deletions },
      metrics: { aiScore: payload?.aiScore, localScore: payload?.localScore, progressPercent: payload?.progressPercent },
      summary: (typeof payload?.summary === 'string' && payload.summary.trim()) ? payload!.summary! : undefined as any,
      overwriteToday: true,
      mergeByMax: true,
    });
    const updated: any = await db.getDay(today);
    return { ok: true, date: today, insertions: updated?.insertions ?? ns.insertions, deletions: updated?.deletions ?? ns.deletions };
  } catch (e:any) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    const st = await tracker.status();
    if (!st.running) { try { await tracker.start(undefined, undefined); } catch {} }
  }
}

ipcMain.handle('app:installRoot', async () => {
  try {
    const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
    return installRoot;
  } catch (e:any) {
    return process.cwd();
  }
});

ipcMain.handle('app:paths', async () => {
  const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
  const logDir = path.join(installRoot, 'cache', 'log');
  const dbDir = path.join(installRoot, 'db');
  return { installRoot, logDir, dbDir };
});

ipcMain.handle('app:openInstallRoot', async () => {
  try { const r = await shell.openPath(app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd()); return { ok: r === '' }; } catch (e:any) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('app:openLogDir', async () => {
  try { const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd(); const dir = path.join(installRoot, 'cache', 'log'); const r = await shell.openPath(dir); return { ok: r === '' }; } catch (e:any) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('app:openDbDir', async () => {
  try { const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd(); const dir = path.join(installRoot, 'db'); const r = await shell.openPath(dir); return { ok: r === '' }; } catch (e:any) { return { ok: false, error: e?.message || String(e) }; }
});

// DB helper: return current DB file path for active repo
ipcMain.handle('db:currentFile', async () => {
  const db = await getSharedDb();
  return db.getFilePath();
});

// Export current repo DB to user-selected path
ipcMain.handle('db:export', async () => {
  try {
    const cfg = await getConfig();
    const db = new DB({ repoPath: cfg.repoPath });
    const src = db.getFilePath();
    // Ensure source exists (create empty DB file if not yet present)
    try { if (!fs.existsSync(src)) { fs.writeFileSync(src, Buffer.from([])); } } catch {}
    const res = await dialog.showSaveDialog({
      title: '导出数据库',
      defaultPath: src.endsWith('.sqljs') ? src : (src + '.sqljs'),
      filters: [{ name: 'SQLite(js) DB', extensions: ['sqljs'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(src, res.filePath);
    return { ok: true, path: res.filePath };
  } catch (e:any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Import DB file (overwrite current repo DB)
ipcMain.handle('db:import', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: '导入数据库',
      properties: ['openFile'],
      filters: [{ name: 'SQLite(js) DB', extensions: ['sqljs'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    const src = res.filePaths[0];
    const cfg = await getConfig();
    const db = new DB({ repoPath: cfg.repoPath });
    const dst = db.getFilePath();
    // backup existing
    try {
      if (fs.existsSync(dst)) {
        const bak = dst.replace(/\.sqljs$/i, '') + `.bak.${Date.now()}.sqljs`;
        fs.copyFileSync(dst, bak);
      }
    } catch {}
    fs.copyFileSync(src, dst);
    // notify renderer config consumers to reload data
    if (win) { try { win.webContents.send('db:imported', { path: dst }); } catch {} }
    return { ok: true, path: dst };
  } catch (e:any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Repo history management
ipcMain.handle('config:repoHistory:remove', async (_evt, payload: { path: string }) => {
  const cfg = await getConfig();
  const target = String(payload?.path || '').trim().toLowerCase();
  const list = Array.isArray((cfg as any).repoHistory) ? ((cfg as any).repoHistory as string[]) : [];
  const next = list.filter(p => String(p||'').trim().toLowerCase() !== target);
  await setConfig({ ...cfg, repoHistory: next } as any);
  return next;
});

ipcMain.handle('config:repoHistory:clear', async () => {
  const cfg = await getConfig();
  await setConfig({ ...cfg, repoHistory: [] } as any);
  return [] as string[];
});

ipcMain.handle('config:repoHistory:top', async (_evt, payload: { path: string }) => {
  const cfg = await getConfig();
  const p = String(payload?.path || '').trim();
  if (!p) return (cfg.repoHistory || []);
  const list = Array.isArray(cfg.repoHistory) ? [...cfg.repoHistory] : [];
  const filtered = list.filter(x => String(x||'').trim().toLowerCase() !== p.toLowerCase());
  filtered.unshift(p);
  const next = filtered.slice(0, 10);
  await setConfig({ ...cfg, repoHistory: next } as any);
  return next;
});

// IPC: background job controls
ipcMain.handle('summary:job:start', async () => {
  const job = await jobManager.startTodaySummaryJob(async (onChunk) => {
    // Let summary service bind DB by current repoPath via ports
    const res = await generateTodaySummary({ onProgress: onChunk });
    // After generating summary, perform an atomic auto-save to persist maxima and lock values
    try { await autoSaveTodayInternal({ summary: res.summary, aiScore: res.scoreAi, localScore: res.scoreLocal, progressPercent: res.progressPercent }); } catch {}
    // Notify renderer to refresh dashboard data once
    if (win) { try { win.webContents.send('stats:refresh'); } catch {} }
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
  // Apply logger config on startup
  getConfig().then(cfg => {
    applyLoggerConfig({ logLevel: cfg.logLevel as any, logNamespaces: (cfg.logNamespaces as any) || [] });
    try {
      const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
      const logDir = path.join(installRoot, 'cache', 'log');
      try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch {}
      const now = new Date();
      const pad = (n:number)=>String(n).padStart(2,'0');
      const half = now.getHours() < 12 ? 'AM' : 'PM';
      const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${half}`;
      const baseName = (cfg.logFileName || 'achievo.log').replace(/[/\\]/g,'');
      const p = cfg.logToFile ? path.join(logDir, `${stamp}_${baseName}`) : null;
      setLogFile(p);
      const boot = getLogger('bootstrap');
      if (boot.enabled.info) boot.info('logger:startup', { installRoot, logDir, logFile: p, level: cfg.logLevel, namespaces: cfg.logNamespaces });
    } catch {}
  }).catch(()=>{});

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
  await setConfig(cfg as any);
  // Re-apply logger config after update
  try {
    const merged = await getConfig();
    applyLoggerConfig({ logLevel: merged.logLevel as any, logNamespaces: (merged.logNamespaces as any) || [] });
    const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
    const logDir = path.join(installRoot, 'cache', 'log');
    try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch {}
    const now = new Date();
    const pad = (n:number)=>String(n).padStart(2,'0');
    const half = now.getHours() < 12 ? 'AM' : 'PM';
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${half}`;
    const baseName = (merged.logFileName || 'achievo.log').replace(/[/\\]/g,'');
    const p = merged.logToFile ? path.join(logDir, `${stamp}_${baseName}`) : null;
    setLogFile(p);
    const boot = getLogger('bootstrap');
    if (boot.enabled.info) boot.info('logger:config:update', { installRoot, logDir, logFile: p, level: merged.logLevel, namespaces: merged.logNamespaces });
  } catch {}
  return true;
});

// Select a local folder
ipcMain.handle('dialog:selectFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});

// App data directory helpers
ipcMain.handle('app:userDataPath', async () => {
  return app.getPath('userData');
});

ipcMain.handle('app:openUserData', async () => {
  try {
    const p = app.getPath('userData');
    const r = await shell.openPath(p);
    return { ok: r === '' };
  } catch (e:any) {
    return { ok: false, error: e?.message || String(e) };
  }
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
  // Bind DB to current repo for this call
  const cfg = await getConfig();
  const db = await getSharedDb();
  let row = await db.getDay(today);
  if (row) {
    // Ensure trend is consistent with baseScore and yesterday base after repo switch or restart
    try {
      const y = new Date(d);
      y.setDate(d.getDate() - 1);
      const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      const yRow: any = await db.getDay(yKey);
      const prevBase = Math.max(100, yRow?.baseScore || 100);
      const shouldTrend = Math.round((row as any).baseScore - prevBase);
      if ((row as any).trend !== shouldTrend) {
        await db.setDayBaseScore(today, (row as any).baseScore);
        row = await db.getDay(today);
      }
    } catch {}
    // If summary is temporarily empty during generation, fallback to latest job result to avoid UI flicker
    try {
      const st: any = await jobManager.getTodayJobStatus();
      const r = st?.result;
      const hasDbSummary = typeof (row as any).summary === 'string' && String((row as any).summary).trim();
      if (!hasDbSummary && r && typeof r.summary === 'string' && r.summary.trim()) {
        row = { ...(row as any), summary: r.summary } as any;
        if (typeof r.scoreAi === 'number') (row as any).aiScore = r.scoreAi;
        if (typeof r.scoreLocal === 'number') (row as any).localScore = r.scoreLocal;
        if (typeof r.progressPercent === 'number') (row as any).progressPercent = r.progressPercent;
        if (typeof r.lastGenAt === 'number') (row as any).lastGenAt = r.lastGenAt;
        if (typeof r.chunksCount === 'number') (row as any).chunksCount = r.chunksCount;
      }
    } catch {}
    return row;
  }
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
  const cfg = await getConfig();
  const db = await getSharedDb();
  return db.getDaysRange(payload.startDate, payload.endDate);
});

// Single day by date (YYYY-MM-DD)
ipcMain.handle('stats:getDay', async (_evt, payload: { date: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  return db.getDay(payload.date);
});

// Helpers: week range by ISO week key (YYYY-Www)
function getIsoWeekRangeByKey(weekKey: string): { start: string; end: string } | null {
  const m = /^([0-9]{4})-W([0-9]{2})$/.exec(String(weekKey));
  if (!m) return null;
  const year = Number(m[1]);
  const w = Number(m[2]);
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const dayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - dayNum + 3);
  const target = new Date(firstThursday);
  target.setUTCDate(firstThursday.getUTCDate() + (w - 1) * 7);
  const monday = new Date(target);
  monday.setUTCDate(target.getUTCDate() - 3);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toKey = (x: Date) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())).toISOString().slice(0, 10);
  return { start: toKey(monday), end: toKey(sunday) };
}

// Stats: week by key
ipcMain.handle('stats:getWeek', async (_evt, payload: { week: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  return db.getWeek(payload.week);
});

// Stats: month by key
ipcMain.handle('stats:getMonth', async (_evt, payload: { month: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  return db.getMonth(payload.month);
});

// Stats: weeks in a month
ipcMain.handle('stats:getWeeksInMonth', async (_evt, payload: { month: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  return db.getWeeksInMonth(payload.month);
});

// Stats: week range helper
ipcMain.handle('stats:getWeekRange', async (_evt, payload: { week: string }) => {
  return getIsoWeekRangeByKey(payload.week);
});

// Summary: generate week summary
ipcMain.handle('summary:generateWeek', async (_evt, payload: { week: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  const svc = new PeriodSummaryService(db);
  const row = await svc.generateWeekSummary(payload.week);
  if (win) { try { win.webContents.send('period:summary:updated', { scope: 'week', key: payload.week }); } catch {} }
  return row;
});

// Summary: generate month summary
ipcMain.handle('summary:generateMonth', async (_evt, payload: { month: string }) => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  const svc = new PeriodSummaryService(db);
  const row = await svc.generateMonthSummary(payload.month);
  if (win) { try { win.webContents.send('period:summary:updated', { scope: 'month', key: payload.month }); } catch {} }
  return row;
});

ipcMain.handle('summary:generate', async () => {
  const db = await getSharedDb();
  const stats = new StatsService(db);
  const r = await stats.generateOnDemandSummary();
  // Notify renderer to refresh once for on-demand generate
  if (win) { try { win.webContents.send('stats:refresh'); } catch {} }
  return r;
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
  const db = await getSharedDb();
  return db.getTotals();
});

// NOTE: read-write live interface 'stats:getTodayLive' has been removed.
// Use 'stats:getTodayLiveReadOnly' for display-only live counts.

// Live totals: adjust DB totals by replacing today's DB counts with live Git counts
ipcMain.handle('stats:getTotalsLive', async () => {
  const cfg = await getConfig();
  const db = await getSharedDb();
  const stats = new StatsService(db);
  return stats.getTotalsLive();
});

// Read-only live Git counts for today (no DB writes)
ipcMain.handle('stats:getTodayLiveReadOnly', async () => {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new (require('./services/gitAnalyzer').GitAnalyzer)(repo);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const ns = await git.getNumstatSinceDate(today);
  return { date: today, insertions: ns.insertions, deletions: ns.deletions };
});

// Atomic auto-save for today's data: merge maxima and persist; pauses tracker during operation
ipcMain.handle('repo:autoSaveToday', async (_evt, payload?: { summary?: string; aiScore?: number; localScore?: number; progressPercent?: number }) => {
  return autoSaveTodayInternal(payload);
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
