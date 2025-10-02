import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export type CreateWindowOptions = {
  isDev: boolean;
  devUrl?: string;
  appPath?: string; // default: app.getAppPath()
};

export function createMainWindow(opts: CreateWindowOptions): BrowserWindow {
  const { isDev, devUrl } = opts;
  const appPath = opts.appPath ?? app.getAppPath();

  // Resolve preload path (.js in dev/build, sometimes .cjs depending on bundler)
  const preloadJs = path.join(__dirname, 'preload.js');
  const preloadCjs = path.join(__dirname, 'preload.cjs');
  const preloadMjs = path.join(__dirname, 'preload.mjs');
  // Prefer .cjs (our esbuild target) to avoid accidentally picking up stale .js
  const preloadPath = [preloadCjs, preloadJs, preloadMjs].find(p => fs.existsSync(p)) || preloadCjs;

  const win = new BrowserWindow({
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
    win.webContents.send('window:maximize-changed', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window:maximize-changed', false);
  });

  // Load content
  (async () => {
    if (isDev && devUrl) {
      await win.loadURL(devUrl);
      win.webContents.openDevTools({ mode: 'detach' });
    } else {
      const indexPath = path.join(appPath, 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        await win.loadFile(indexPath);
      } else {
        await win.loadURL('data:text/html,<h1>Build not found</h1>');
      }
    }
  })().catch(() => {/* ignore */});

  return win;
}
