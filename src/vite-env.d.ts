/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      // app features
      analyzeDiff: (payload: { before: string; after: string }) => Promise<{ score: number; summary: string }>;
      getHistory: () => Promise<any[]>;
      getConfig: () => Promise<{
        openaiApiKey?: string;
        repoPath?: string;
        lastProcessedCommit?: string | null;
        lastSummaryDate?: string | null;
        aiProvider?: 'openai' | 'deepseek' | 'custom';
        aiModel?: string;
        aiBaseUrl?: string;
        aiApiKey?: string;
      }>;
      setConfig: (cfg: {
        openaiApiKey?: string;
        repoPath?: string;
        lastProcessedCommit?: string | null;
        lastSummaryDate?: string | null;
        aiProvider?: 'openai' | 'deepseek' | 'custom';
        aiModel?: string;
        aiBaseUrl?: string;
        aiApiKey?: string;
      }) => Promise<any>;
      selectFolder: () => Promise<{ canceled: boolean; path?: string }>;
      trackingStart: (payload: { repoPath?: string; intervalMs?: number }) => Promise<any>;
      trackingStop: () => Promise<any>;
      trackingStatus: () => Promise<any>;
      statsGetToday: () => Promise<any>;
      statsGetRange: (payload: { startDate: string; endDate: string }) => Promise<any>;
      summaryGenerate: () => Promise<any>;
      trackingAnalyzeOnce: (payload: { repoPath?: string }) => Promise<any>;
      summaryTodayDiff: () => Promise<{ date: string; summary: string }>;

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
