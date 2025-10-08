import { DB, DayRow } from './db_sqljs';
import { GitAnalyzer, GitDiffNumstat } from './gitAnalyzer';
import { summarizeUnifiedDiff, summarizeUnifiedDiffChunked } from './aiSummarizer';
import type { DiffFeatures } from './diffFeatures';
import { getConfig, AppConfig } from './config';

export type DBPort = {
  getYesterday: (date: string) => string | null;
  getDay: (date: string) => Promise<DayRow | null>;
  getDaysRange: (start: string, end: string) => Promise<DayRow[]>;
  setDayCounts: (date: string, insertions: number, deletions: number) => Promise<void>;
  setDaySummary: (date: string, summary: string) => Promise<void>;
  updateAggregatesForDate: (date: string) => Promise<void>;
  setDayMetrics: (date: string, metrics: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null }, opts?: { overwriteToday?: boolean }) => Promise<void>;
  setDayAiMeta: (date: string, meta: { aiModel?: string; aiProvider?: string; aiTokens?: number; aiDurationMs?: number; chunksCount?: number; lastGenAt?: number }) => Promise<void>;
  applyTodayUpdate: (date: string, opts: {
    counts?: { insertions: number; deletions: number };
    metrics?: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null };
    summary?: string | null;
    aiMeta?: { aiModel?: string | null; aiProvider?: string | null; aiTokens?: number | null; aiDurationMs?: number | null; chunksCount?: number | null; lastGenAt?: number | null };
    overwriteToday?: boolean;
    mergeByMax?: boolean;
  }) => Promise<void>;
};

export type GitPort = {
  getUnifiedDiffSinceDate: (date: string) => Promise<string>;
  getNumstatSinceDate: (date: string) => Promise<GitDiffNumstat>;
};

export type SummarizerPort = {
  summarizeUnifiedDiff: (
    diff: string,
    ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures }
  ) => Promise<{ text: string; model?: string; provider?: string; tokens?: number; durationMs?: number }>;
  summarizeUnifiedDiffChunked: (
    diff: string,
    ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures; onProgress?: (done: number, total: number) => void }
  ) => Promise<{ text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number }>;
};

export type Ports = {
  db: DBPort;
  git: GitPort;
  summarizer: SummarizerPort;
  cfg: AppConfig;
};

class SqljsDbAdapter implements DBPort {
  constructor(private inner: DB) {}
  getYesterday(date: string) { return this.inner.getYesterday(date); }
  getDay(date: string) { return this.inner.getDay(date); }
  getDaysRange(start: string, end: string) { return this.inner.getDaysRange(start, end); }
  setDayCounts(date: string, insertions: number, deletions: number) { return this.inner.setDayCounts(date, insertions, deletions); }
  setDaySummary(date: string, summary: string) { return this.inner.setDaySummary(date, summary); }
  updateAggregatesForDate(date: string) { return this.inner.updateAggregatesForDate(date); }
  setDayMetrics(date: string, metrics: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null }, opts?: { overwriteToday?: boolean }) { return this.inner.setDayMetrics(date, metrics, opts); }
  setDayAiMeta(date: string, meta: { aiModel?: string; aiProvider?: string; aiTokens?: number; aiDurationMs?: number; chunksCount?: number; lastGenAt?: number }) { return this.inner.setDayAiMeta(date, meta); }
  applyTodayUpdate(date: string, opts: {
    counts?: { insertions: number; deletions: number };
    metrics?: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null };
    summary?: string | null;
    aiMeta?: { aiModel?: string | null; aiProvider?: string | null; aiTokens?: number | null; aiDurationMs?: number | null; chunksCount?: number | null; lastGenAt?: number | null };
    overwriteToday?: boolean;
    mergeByMax?: boolean;
  }) { return (this.inner as any).applyTodayUpdate(date, opts); }
}

class GitAdapter implements GitPort {
  constructor(private ga: GitAnalyzer) {}
  getUnifiedDiffSinceDate(date: string) { return this.ga.getUnifiedDiffSinceDate(date); }
  getNumstatSinceDate(date: string) { return this.ga.getNumstatSinceDate(date); }
}

class SummarizerAdapter implements SummarizerPort {
  summarizeUnifiedDiff(diff: string, ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures }) {
    return summarizeUnifiedDiff(diff, ctx);
  }
  summarizeUnifiedDiffChunked(diff: string, ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures; onProgress?: (done: number, total: number) => void }) {
    return summarizeUnifiedDiffChunked(diff, ctx);
  }
}

export async function makeDefaultPorts(deps?: { db?: DB | DBPort; repoPath?: string; summarizer?: SummarizerPort }): Promise<Ports> {
  const cfg = await getConfig();
  const repo = deps?.repoPath ?? cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const ga = new GitAnalyzer(repo);
  // Normalize db port
  let dbPort: DBPort;
  if (deps?.db) {
    dbPort = deps.db instanceof DB ? new SqljsDbAdapter(deps.db) : (deps.db as DBPort);
  } else {
    // Fallback to a new instance bound to current repo if not injected
    dbPort = new SqljsDbAdapter(new DB({ repoPath: repo }));
  }
  return {
    db: dbPort,
    git: new GitAdapter(ga),
    summarizer: deps?.summarizer ?? new SummarizerAdapter(),
    cfg,
  };
}
