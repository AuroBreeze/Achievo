import { DB, DayRow } from './db_sqljs';
import { getConfig, setConfig } from './config';
import { summarizeWithAI } from './aiSummarizer';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeTotals(days: DayRow[]) {
  let insertions = 0, deletions = 0;
  for (const d of days) { insertions += d.insertions; deletions += d.deletions; }
  const baseScore = Math.max(0, Math.round(insertions * 2 + deletions * 1));
  return { insertions, deletions, baseScore };
}

export class StatsService {
  constructor(private db = new DB()) {}

  async getToday(): Promise<DayRow> {
    const key = todayKey();
    const row = await this.db.getDay(key);
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
    return this.db.getDaysRange(startDate, endDate);
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

    const text = await summarizeWithAI(
      { added: totals.insertions, removed: totals.deletions, changed: 0, totalBefore: 0, totalAfter: 0 },
      Math.min(100, totals.baseScore)
    );

    // Save summary to today's row
    const existingToday = await this.db.getDay(today);
    if (existingToday) await this.db.setDaySummary(today, text);
    else {
      // ensure there's at least an empty row to attach summary
      await this.db.upsertDayAccumulate(today, 0, 0);
      await this.db.setDaySummary(today, text);
    }

    // Update lastSummaryDate
    cfg.lastSummaryDate = today;
    await setConfig(cfg);

    return { date: today, summary: text };
  }
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
