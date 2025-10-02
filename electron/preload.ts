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
  statsGetTotals: () => ipcRenderer.invoke('stats:getTotals'),
  statsGetTodayLive: () => ipcRenderer.invoke('stats:getTodayLive'),
  statsGetTotalsLive: () => ipcRenderer.invoke('stats:getTotalsLive'),
  summaryGenerate: () => ipcRenderer.invoke('summary:generate'),
  trackingAnalyzeOnce: (payload: { repoPath?: string }) => ipcRenderer.invoke('tracking:analyzeOnce', payload),
  summaryTodayDiff: () => ipcRenderer.invoke('summary:todayDiff'),
  diffToday: () => ipcRenderer.invoke('diff:today'),

  // app data directory helpers
  userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),

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

  // background summary job
  startSummaryJob: () => ipcRenderer.invoke('summary:job:start'),
  getSummaryJobStatus: () => ipcRenderer.invoke('summary:job:status'),
  onSummaryJobProgress: (callback: (payload: { id: string; progress: number; status: string }) => void) => {
    const listener = (_: unknown, payload: { id: string; progress: number; status: string }) => callback(payload);
    ipcRenderer.on('summary:job:progress', listener);
    return () => ipcRenderer.removeListener('summary:job:progress', listener);
  },
});
