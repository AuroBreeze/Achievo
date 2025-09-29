import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeDiff } from './services/codeAnalyzer';
import { scoreProgress } from './services/progressScorer';
import { summarizeWithAI } from './services/aiSummarizer';
import { Storage } from './services/storage';
import { getConfig, setConfig } from './services/config';
import { TrackerService } from './services/tracker';
import { StatsService } from './services/stats';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const storage = new Storage();
const tracker = new TrackerService();
const stats = new StatsService();

let win: BrowserWindow | null = null;

async function createWindow() {
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
      preload: path.join(__dirname, 'preload.js'),
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
  return storage.getAll();
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
  return stats.getToday();
});

ipcMain.handle('stats:getRange', async (_evt, payload: { startDate: string; endDate: string }) => {
  return stats.getRange(payload.startDate, payload.endDate);
});

ipcMain.handle('summary:generate', async () => {
  return stats.generateOnDemandSummary();
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
