import { DB, DayRow } from './db_sqljs';
import { getConfig, setConfig } from './config';
import { GitAnalyzer } from './gitAnalyzer';
import { todayKey as todayKeyUtil } from './dateUtil';
import { summarizeWithAI } from './aiSummarizer';
import { getLogger } from './logger';

function todayKey(): string {
  // Unified today key from dateUtil
  return todayKeyUtil();
}

function computeTotals(days: DayRow[]) {
  let insertions = 0, deletions = 0;
  for (const d of days) { insertions += d.insertions; deletions += d.deletions; }
  const baseScore = Math.max(0, Math.round(insertions * 2 + deletions * 1));
  return { insertions, deletions, baseScore };
}

export class StatsService {
  constructor(private db: DB = new DB()) {}
  private logger = getLogger('stats');

  async getToday(): Promise<DayRow> {
    const key = todayKey();
    const row = await this.db.getDay(key);
    if (this.logger.enabled.debug) this.logger.debug('getToday', { key, found: !!row });
    return row || {
      date: key,
      insertions: 0,
      deletions: 0,
      baseScore: 0,
      trend: 0,
      summary: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async getRange(startDate: string, endDate: string): Promise<DayRow[]> {
    const rows = await this.db.getDaysRange(startDate, endDate);
    if (this.logger.enabled.debug) this.logger.debug('getRange', { startDate, endDate, count: rows.length });
    return rows;
  }

  // Generate summary for changes from the day after lastSummaryDate to today (inclusive)
  async generateOnDemandSummary(): Promise<{ date: string; summary: string }> {
    const cfg = await getConfig();
    const today = todayKey();
    let from = cfg.lastSummaryDate;

    // If lastSummaryDate is today, nothing new; allow summarizing just today
    if (!from) from = today; // first-time summary => only today

    // Determine start date (inclusive). If from is before today, we can start from from itself or next day?
    // Requirement: "从上一次记录到今天记录的代码的改变" -> start is the day after last summary
    const start = from === today ? today : nextDay(from);
    const days = await this.db.getDaysRange(start, today);
    const totals = computeTotals(days);

    const content = `请用中文总结从${start}到${today}期间的代码变更：\n` +
      `总新增行: ${totals.insertions}，总删除行: ${totals.deletions}，基础分估算: ${totals.baseScore}。`;

    if (this.logger.enabled.debug) this.logger.debug('generateOnDemandSummary:input', { start, today, totals });
    const text = await summarizeWithAI(
      { added: totals.insertions, removed: totals.deletions, changed: 0, totalBefore: 0, totalAfter: 0 },
      Math.min(100, totals.baseScore)
    );

    // Save summary to today's row
    // If AI returns JSON, extract markdown field; otherwise keep raw text
    let toSave = text;
    try {
      const obj = JSON.parse(text);
      const md = obj?.markdown ?? obj?.summary ?? obj?.text;
      if (typeof md === 'string' && md.trim()) toSave = md;
    } catch {}

    const existingToday = await this.db.getDay(today);
    if (existingToday) await this.db.setDaySummary(today, toSave);
    else {
      // ensure there's at least an empty row to attach summary
      await this.db.upsertDayAccumulate(today, 0, 0);
      await this.db.setDaySummary(today, toSave);
    }

    // Update lastSummaryDate
    cfg.lastSummaryDate = today;
    await setConfig(cfg);

    if (this.logger.enabled.info) this.logger.info('generateOnDemandSummary:done', { date: today, len: (toSave || '').length });
    return { date: today, summary: toSave };
  }

  // Live Git-based today's insertions/deletions (includes working tree), with DB sync
  async getTodayLive(): Promise<{ date: string; insertions: number; deletions: number; total: number }> {
    const cfg = await getConfig();
    const repo = cfg.repoPath;
    if (!repo) throw new Error('未设置仓库路径');
    const git = new GitAnalyzer(repo);
    const today = todayKey();
    const ns = await git.getNumstatSinceDate(today);
    if (this.logger.enabled.debug) this.logger.debug('getTodayLive:numstat', { today, ...ns });
    // Persist to DB for real-time baseScore/trend
    try {
      await this.db.setDayCounts(today, ns.insertions, ns.deletions);
      try {
        const row = await this.db.getDay(today);
        if (row && (typeof row.aiScore === 'number' || typeof row.localScore === 'number')) {
          await this.db.setDayMetrics(today, { aiScore: row.aiScore ?? undefined, localScore: row.localScore ?? undefined, progressPercent: row.progressPercent ?? undefined });
        }
      } catch {}
    } catch {}
    const total = Math.max(0, (ns.insertions || 0)) + Math.max(0, (ns.deletions || 0));
    const out = { date: today, insertions: ns.insertions, deletions: ns.deletions, total };
    if (this.logger.enabled.debug) this.logger.debug('getTodayLive:out', out);
    return out;
  }

  // Live totals: adjust DB totals by replacing today's DB counts with live Git counts
  async getTotalsLive(): Promise<{ insertions: number; deletions: number; total: number }> {
    const cfg = await getConfig();
    const repo = cfg.repoPath;
    if (!repo) throw new Error('未设置仓库路径');
    const git = new GitAnalyzer(repo);
    const today = todayKey();
    const totals = await this.db.getTotals();
    const todayRow = await this.db.getDay(today);
    const live = await git.getNumstatSinceDate(today);
    const dbTodayIns = todayRow?.insertions || 0;
    const dbTodayDel = todayRow?.deletions || 0;
    const adjIns = Math.max(0, (totals.insertions || 0) - dbTodayIns + live.insertions);
    const adjDel = Math.max(0, (totals.deletions || 0) - dbTodayDel + live.deletions);
    const out = { insertions: adjIns, deletions: adjDel, total: adjIns + adjDel };
    if (this.logger.enabled.debug) this.logger.debug('getTotalsLive', { today, totals, todayRowExists: !!todayRow, live, out });
    return out;
  }
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
