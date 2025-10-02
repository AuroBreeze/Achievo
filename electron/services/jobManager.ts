export type JobStatus = {
  id: string;
  type: 'today-summary';
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number; // 0..100
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  result?: {
    date: string;
    summary: string;
    scoreAi: number;
    scoreLocal: number;
    progressPercent: number;
    featuresSummary: string;
    aiModel?: string | null;
    aiProvider?: string | null;
    aiTokens?: number | null;
    aiDurationMs?: number | null;
    chunksCount?: number | null;
    lastGenAt?: number | null;
  };
};

export class JobManager {
  private summaryJob: JobStatus = { id: 'today', type: 'today-summary', status: 'idle', progress: 0 };
  private listeners: Array<(s: JobStatus) => void> = [];

  onProgress(listener: (s: JobStatus) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emitUpdate() {
    for (const l of this.listeners) {
      try { l(this.summaryJob); } catch {}
    }
  }

  private setProgress(p: number) {
    this.summaryJob.progress = Math.max(0, Math.min(100, Math.round(p)));
    this.emitUpdate();
  }

  getTodayJobStatus(): JobStatus {
    return this.summaryJob;
  }

  async startTodaySummaryJob(run: (onChunk: (done: number, total: number) => void) => Promise<JobStatus['result']>): Promise<JobStatus> {
    if (this.summaryJob.status === 'running') return this.summaryJob;
    this.summaryJob = { id: 'today', type: 'today-summary', status: 'running', progress: 0, startedAt: Date.now() };
    this.emitUpdate();

    (async () => {
      try {
        this.setProgress(1);
        // Preparation done
        this.setProgress(10);
        const result = await run((done, total) => {
          const base = 20; // after preparation
          const span = 75; // 20 -> 95
          const pct = base + Math.floor((span * done) / Math.max(1, total));
          this.setProgress(Math.min(95, Math.max(20, pct)));
        });
        this.summaryJob.result = result;
        this.summaryJob.status = 'done';
        this.summaryJob.finishedAt = Date.now();
        this.setProgress(100);
      } catch (e: any) {
        this.summaryJob.status = 'error';
        this.summaryJob.error = e?.message || String(e);
        this.summaryJob.finishedAt = Date.now();
        this.emitUpdate();
      }
    })();

    return this.summaryJob;
  }
}
