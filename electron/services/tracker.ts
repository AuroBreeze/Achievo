import { GitAnalyzer } from './gitAnalyzer';
import { DB } from './db_sqljs';
import { getConfig, setConfig } from './config';

export type TrackerStatus = {
  running: boolean;
  repoPath?: string;
  intervalMs?: number;
  lastProcessedCommit?: string | null;
  lastError?: string | null;
};

export class TrackerService {
  private timer: NodeJS.Timeout | null = null;
  private lastProcessedCommit: string | null = null;
  private lastError: string | null = null;
  private db = new DB();
  private repoPath: string | undefined;
  private intervalMs = 30_000; // default 30s

  async start(repoPath?: string, intervalMs?: number) {
    const cfg = await getConfig();
    if (repoPath) cfg.repoPath = repoPath;
    if (intervalMs && intervalMs > 1000) this.intervalMs = intervalMs;
    await setConfig(cfg);

    this.repoPath = cfg.repoPath;
    if (!this.repoPath) throw new Error('未设置仓库路径');

    // load last processed commit from config if any
    this.lastProcessedCommit = cfg.lastProcessedCommit ?? null;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick().catch(()=>{}), this.intervalMs);
    // run immediately
    await this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): TrackerStatus {
    return {
      running: !!this.timer,
      repoPath: this.repoPath,
      intervalMs: this.intervalMs,
      lastProcessedCommit: this.lastProcessedCommit,
      lastError: this.lastError,
    };
  }

  private async tick() {
    try {
      this.lastError = null;
      if (!this.repoPath) return;
      const git = new GitAnalyzer(this.repoPath);
      const head = await git.getHeadCommit();
      if (!head) return;

      if (this.lastProcessedCommit === head) return; // nothing new

      const num = await git.getDiffNumstat(this.lastProcessedCommit, head);
      // accumulate to today's record
      const today = new Date().toISOString().slice(0, 10);
      await this.db.upsertDayAccumulate(today, num.insertions, num.deletions);
      // recompute aggregates for week/month/year
      await this.db.updateAggregatesForDate(today);

      this.lastProcessedCommit = head;
      const cfg2 = await getConfig();
      cfg2.lastProcessedCommit = head;
      await setConfig(cfg2);
    } catch (e) {
      this.lastError = (e as Error).message;
    }
  }

  // Run a single analysis without starting any timer
  async analyzeOnce(repoPath?: string) {
    const cfg = await getConfig();
    if (repoPath) cfg.repoPath = repoPath;
    await setConfig(cfg);

    this.repoPath = cfg.repoPath;
    if (!this.repoPath) throw new Error('未设置仓库路径');
    await this.tick();
    return this.status();
  }
}
