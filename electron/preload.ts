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
  statsGetDay: (payload: { date: string }) => ipcRenderer.invoke('stats:getDay', payload),
  // week/month stats
  statsGetWeek: (payload: { week: string }) => ipcRenderer.invoke('stats:getWeek', payload),
  statsGetMonth: (payload: { month: string }) => ipcRenderer.invoke('stats:getMonth', payload),
  statsGetWeeksInMonth: (payload: { month: string }) => ipcRenderer.invoke('stats:getWeeksInMonth', payload),
  statsGetWeekRange: (payload: { week: string }) => ipcRenderer.invoke('stats:getWeekRange', payload),
  statsGetMonthsWithData: (payload?: { limit?: number }) => ipcRenderer.invoke('stats:getMonthsWithData', payload),
  statsGetMonthsFromDays: (payload?: { limit?: number }) => ipcRenderer.invoke('stats:getMonthsFromDays', payload),
  statsGetFirstDayDate: () => ipcRenderer.invoke('stats:getFirstDayDate'),
  statsGetTotals: () => ipcRenderer.invoke('stats:getTotals'),
  // read-only live counts (no DB writes)
  statsGetTodayLiveReadOnly: () => ipcRenderer.invoke('stats:getTodayLiveReadOnly'),
  statsGetTotalsLive: () => ipcRenderer.invoke('stats:getTotalsLive'),
  summaryGenerate: () => ipcRenderer.invoke('summary:generate'),
  summaryGenerateWeek: (payload: { week: string }) => ipcRenderer.invoke('summary:generateWeek', payload),
  summaryGenerateMonth: (payload: { month: string }) => ipcRenderer.invoke('summary:generateMonth', payload),
  trackingAnalyzeOnce: (payload: { repoPath?: string }) => ipcRenderer.invoke('tracking:analyzeOnce', payload),
  summaryTodayDiff: () => ipcRenderer.invoke('summary:todayDiff'),
  diffToday: () => ipcRenderer.invoke('diff:today'),
  // repo auto-save (atomic, pauses tracker)
  repoAutoSaveToday: (payload?: { summary?: string; aiScore?: number; localScore?: number; progressPercent?: number }) => ipcRenderer.invoke('repo:autoSaveToday', payload),

  // app data directory helpers
  userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  installRoot: () => ipcRenderer.invoke('app:installRoot'),
  paths: () => ipcRenderer.invoke('app:paths'),
  openInstallRoot: () => ipcRenderer.invoke('app:openInstallRoot'),
  openLogDir: () => ipcRenderer.invoke('app:openLogDir'),
  openDbDir: () => ipcRenderer.invoke('app:openDbDir'),
  dbCurrentFile: () => ipcRenderer.invoke('db:currentFile'),
  dbExport: () => ipcRenderer.invoke('db:export'),
  dbImport: () => ipcRenderer.invoke('db:import'),

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
  onStatsRefreshOnce: (callback: () => void) => {
    const listener = () => { callback(); ipcRenderer.removeListener('stats:refresh', listener); };
    ipcRenderer.on('stats:refresh', listener);
  },
  onDbImportedOnce: (callback: (payload: { path: string }) => void) => {
    const listener = (_: unknown, payload: { path: string }) => { callback(payload); ipcRenderer.removeListener('db:imported', listener); };
    ipcRenderer.on('db:imported', listener);
  },

  // repo history management
  repoHistoryRemove: (path: string) => ipcRenderer.invoke('config:repoHistory:remove', { path }),
  repoHistoryClear: () => ipcRenderer.invoke('config:repoHistory:clear'),
  repoHistoryTop: (path: string) => ipcRenderer.invoke('config:repoHistory:top', { path }),
});
