import { GitAnalyzer } from './gitAnalyzer';
import { DB } from './db_sqljs';
import { getConfig, setConfig } from './config';
import { getLogger } from './logger';

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
  private db: DB;
  private dbProvider?: () => Promise<DB>;
  private repoPath: string | undefined;
  private intervalMs = 30_000; // default 30s
  constructor(dbOrOpts?: DB | { dbProvider?: () => Promise<DB> }) {
    if (dbOrOpts && 'getFilePath' in (dbOrOpts as any)) {
      this.db = dbOrOpts as DB;
    } else {
      this.db = new DB();
      this.dbProvider = (dbOrOpts as any)?.dbProvider;
    }
  }
  private logger = getLogger('tracker');

  async start(repoPath?: string, intervalMs?: number) {
    const cfg = await getConfig();
    if (repoPath) cfg.repoPath = repoPath;
    if (intervalMs && intervalMs > 1000) this.intervalMs = intervalMs;
    await setConfig(cfg);

    this.repoPath = cfg.repoPath;
    if (!this.repoPath) throw new Error('未设置仓库路径');
    // Rebind DB to this repo (prefer shared provider to avoid multi-instance writes)
    if (this.dbProvider) {
      try { this.db = await this.dbProvider(); } catch { this.db = new DB({ repoPath: this.repoPath }); }
    } else {
      this.db = new DB({ repoPath: this.repoPath });
    }

    // load last processed commit from config if any
    this.lastProcessedCommit = cfg.lastProcessedCommit ?? null;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick().catch(()=>{}), this.intervalMs);
    // run immediately
    if (this.logger.enabled.info) this.logger.info('tracker:start', { repoPath: this.repoPath, intervalMs: this.intervalMs, lastProcessedCommit: this.lastProcessedCommit });
    await this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.logger.enabled.info) this.logger.info('tracker:stop');
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
      if (this.logger.enabled.debug) this.logger.debug('tick:head', { head, lastProcessedCommit: this.lastProcessedCommit });
      if (!head) return;

      if (this.lastProcessedCommit === head) return; // nothing new

      const num = await git.getDiffNumstat(this.lastProcessedCommit, head);
      if (this.logger.enabled.debug) this.logger.debug('tick:numstat', num);
      // merge today's totals using maxima semantics to avoid double counting
      const today = new Date().toISOString().slice(0, 10);
      await (this.db as any).applyTodayUpdate?.(today, {
        counts: { insertions: Math.max(0, num.insertions||0), deletions: Math.max(0, num.deletions||0) },
        mergeByMax: true,
        overwriteToday: false,
      });
      if (this.logger.enabled.debug) this.logger.debug('tick:db:applyTodayUpdate', { today, ...num });

      this.lastProcessedCommit = head;
      const cfg2 = await getConfig();
      cfg2.lastProcessedCommit = head;
      await setConfig(cfg2);
      if (this.logger.enabled.info) this.logger.info('tick:done', { head });
    } catch (e) {
      this.lastError = (e as Error).message;
      if (this.logger.enabled.error) this.logger.error('tick:error', { error: this.lastError });
    }
  }

  // Run a single analysis without starting any timer
  async analyzeOnce(repoPath?: string) {
    const cfg = await getConfig();
    if (repoPath) cfg.repoPath = repoPath;
    await setConfig(cfg);

    this.repoPath = cfg.repoPath;
    if (!this.repoPath) throw new Error('未设置仓库路径');
    // Rebind DB to this repo for one-shot (prefer shared provider)
    if (this.dbProvider) {
      try { this.db = await this.dbProvider(); } catch { this.db = new DB({ repoPath: this.repoPath }); }
    } else {
      this.db = new DB({ repoPath: this.repoPath });
    }
    if (this.logger.enabled.info) this.logger.info('analyzeOnce', { repoPath: this.repoPath });
    await this.tick();
    return this.status();
  }
}
