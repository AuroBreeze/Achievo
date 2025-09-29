import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // app features
  analyzeDiff: (payload: { before: string; after: string }) => ipcRenderer.invoke('analyze:diff', payload),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg: { openaiApiKey?: string; repoPath?: string }) => ipcRenderer.invoke('config:set', cfg),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  trackingStart: (payload: { repoPath?: string; intervalMs?: number }) => ipcRenderer.invoke('tracking:start', payload),
  trackingStop: () => ipcRenderer.invoke('tracking:stop'),
  trackingStatus: () => ipcRenderer.invoke('tracking:status'),
  statsGetToday: () => ipcRenderer.invoke('stats:getToday'),
  statsGetRange: (payload: { startDate: string; endDate: string }) => ipcRenderer.invoke('stats:getRange', payload),
  summaryGenerate: () => ipcRenderer.invoke('summary:generate'),
  trackingAnalyzeOnce: (payload: { repoPath?: string }) => ipcRenderer.invoke('tracking:analyzeOnce', payload),
  summaryTodayDiff: () => ipcRenderer.invoke('summary:todayDiff'),
  diffToday: () => ipcRenderer.invoke('diff:today'),

  // window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  onWindowMaximizeChanged: (callback: (isMax: boolean) => void) => {
    const listener = (_: unknown, isMax: boolean) => callback(isMax);
    ipcRenderer.on('window:maximize-changed', listener);
    return () => ipcRenderer.removeListener('window:maximize-changed', listener);
  },
});
