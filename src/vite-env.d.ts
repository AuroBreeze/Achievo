/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      // app features
      analyzeDiff: (payload: { before: string; after: string }) => Promise<{ score: number; summary: string }>;
      getHistory: () => Promise<any[]>;
      getConfig: () => Promise<{ openaiApiKey?: string; repoPath?: string }>;
      setConfig: (cfg: { openaiApiKey?: string; repoPath?: string }) => Promise<any>;
      selectFolder: () => Promise<{ canceled: boolean; path?: string }>;
      trackingStart: (payload: { repoPath?: string; intervalMs?: number }) => Promise<any>;
      trackingStop: () => Promise<any>;
      trackingStatus: () => Promise<any>;
      statsGetToday: () => Promise<any>;
      statsGetRange: (payload: { startDate: string; endDate: string }) => Promise<any>;
      summaryGenerate: () => Promise<any>;

      // window controls
      windowMinimize: () => Promise<void>;
      windowToggleMaximize: () => Promise<boolean>;
      windowIsMaximized: () => Promise<boolean>;
      windowClose: () => Promise<void>;
      onWindowMaximizeChanged: (callback: (isMax: boolean) => void) => () => void;
    };
  }
}

export {};
