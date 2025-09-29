import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
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
});
