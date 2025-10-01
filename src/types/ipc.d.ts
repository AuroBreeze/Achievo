export {};

declare global {
  interface Window {
    api?: {
      analyzeDiff(payload: { before: string; after: string }): Promise<{ score: number; summary: string }>;
      getHistory(): Promise<{ timestamp: number; score: number; summary: string }[]>;
      getConfig(): Promise<{ openaiApiKey?: string; repoPath?: string; lastProcessedCommit?: string | null; lastSummaryDate?: string | null; aiProvider?: 'openai' | 'deepseek' | 'custom'; aiModel?: string; aiBaseUrl?: string; aiApiKey?: string }>; 
      setConfig(cfg: { openaiApiKey?: string; repoPath?: string; lastProcessedCommit?: string | null; lastSummaryDate?: string | null; aiProvider?: 'openai' | 'deepseek' | 'custom'; aiModel?: string; aiBaseUrl?: string; aiApiKey?: string }): Promise<void>;
      selectFolder(): Promise<{ canceled: boolean; path?: string }>;
      trackingStart(payload: { repoPath?: string; intervalMs?: number }): Promise<{ running: boolean; repoPath?: string; intervalMs?: number; lastProcessedCommit?: string | null; lastError?: string | null }>;
      trackingStop(): Promise<{ running: boolean; repoPath?: string; intervalMs?: number; lastProcessedCommit?: string | null; lastError?: string | null }>;
      trackingStatus(): Promise<{ running: boolean; repoPath?: string; intervalMs?: number; lastProcessedCommit?: string | null; lastError?: string | null }>;
      trackingAnalyzeOnce(payload: { repoPath?: string }): Promise<{ running: boolean; repoPath?: string; intervalMs?: number; lastProcessedCommit?: string | null; lastError?: string | null }>;
      statsGetToday(): Promise<{ date: string; insertions: number; deletions: number; baseScore: number; trend: number; summary?: string | null; createdAt: number; updatedAt: number }>;
      statsGetRange(payload: { startDate: string; endDate: string }): Promise<Array<{ date: string; insertions: number; deletions: number; baseScore: number; trend: number; summary?: string | null; createdAt: number; updatedAt: number }>>;
      summaryGenerate(): Promise<{ date: string; summary: string }>;
      summaryTodayDiff(): Promise<{ date: string; summary: string; scoreAi?: number; scoreLocal?: number; progressPercent?: number }>;
      diffToday(): Promise<{ date: string; diff: string }>;
      statsGetTotals(): Promise<{ insertions: number; deletions: number; total: number }>;
      statsGetTodayLive(): Promise<{ date: string; insertions: number; deletions: number }>;
      statsGetTotalsLive(): Promise<{ insertions: number; deletions: number; total: number }>;

      // window controls
      windowMinimize(): Promise<void>;
      windowToggleMaximize(): Promise<boolean>;
      windowIsMaximized(): Promise<boolean>;
      windowClose(): Promise<void>;
      onWindowMaximizeChanged(callback: (isMax: boolean) => void): () => void;
    };
  }
}
