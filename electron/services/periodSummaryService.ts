import { DB } from './db_sqljs';
import { getConfig } from './config';
import { getLogger } from './logger';
import { summarizeWithAI } from './aiSummarizer';

const logger = getLogger('period');

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const m = /^([0-9]{4})-W([0-9]{2})$/.exec(String(weekKey));
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

function getIsoWeekRangeByKey(weekKey: string): { start: string; end: string } | null {
  const p = parseWeekKey(weekKey);
  if (!p) return null;
  // ISO week: find Thursday of the week, then back to Monday and forward to Sunday
  const firstThursday = new Date(Date.UTC(p.year, 0, 4));
  const dayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - dayNum + 3); // First Thursday of ISO year
  const target = new Date(firstThursday);
  target.setUTCDate(firstThursday.getUTCDate() + (p.week - 1) * 7);
  const monday = new Date(target);
  monday.setUTCDate(target.getUTCDate() - 3); // go back to Monday of that week
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toKey = (x: Date) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())).toISOString().slice(0, 10);
  return { start: toKey(monday), end: toKey(sunday) };
}

function formatMergedMarkdown(title: string, parts: Array<{ date: string; text: string }>): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  for (const p of parts) {
    lines.push(`## ${p.date}`);
    const t = (p.text || '').trim();
    lines.push(t ? t : '（无当日总结）');
    lines.push('');
  }
  return lines.join('\n');
}

export class PeriodSummaryService {
  constructor(private db: DB) {}

  async generateWeekSummary(weekKey: string): Promise<any> {
    const cfg = await getConfig();
    const offline = !!(cfg as any)?.offlineMode;
    const range = getIsoWeekRangeByKey(weekKey);
    if (!range) throw new Error('非法的周键：' + weekKey);

    const days = await this.db.getDaysRange(range.start, range.end);
    // 聚合指标
    let ins = 0, del = 0;
    let lastBase = 0;
    let aiSum = 0, aiCnt = 0;
    let locSum = 0, locCnt = 0;
    let progSum = 0, progCnt = 0;
    const parts: Array<{ date: string; text: string }> = [];
    for (const d of days) {
      ins += Math.max(0, d.insertions || 0);
      del += Math.max(0, d.deletions || 0);
      lastBase = d.baseScore || lastBase;
      if (typeof d.aiScore === 'number') { aiSum += d.aiScore; aiCnt++; }
      if (typeof (d as any).localScore === 'number') { locSum += (d as any).localScore as number; locCnt++; }
      if (typeof (d as any).progressPercent === 'number') { progSum += (d as any).progressPercent as number; progCnt++; }
      parts.push({ date: d.date, text: String((d.summary || '')).trim() });
    }
    const aiAvg = aiCnt ? Math.round(aiSum / aiCnt) : null;
    const locAvg = locCnt ? Math.round(locSum / locCnt) : null;
    const progAvg = progCnt ? Math.round(progSum / progCnt) : null;

    // 趋势：与前一周末 base 差
    let trend = 0;
    try {
      const prevKey = (() => {
        const p = parseWeekKey(weekKey)!; const w = p.week - 1; const y = p.year + (w <= 0 ? -1 : 0); const wn = (w <= 0 ? 52 : w);
        return `${y}-W${String(wn).padStart(2, '0')}`;
      })();
      const prev = await this.db.getWeek(prevKey);
      const prevBase = (typeof prev?.baseScore === 'number')
        ? prev.baseScore
        : ((days.length && days[0]) ? (days[0].baseScore ?? 0) : 0);
      trend = Math.round((lastBase || 0) - prevBase);
    } catch {}

    // 生成摘要：在线用 AI，总结合并 Markdown；离线用本地合并
    const merged = formatMergedMarkdown(`周总结（${weekKey}）- 合并素材`, parts);
    let summary = merged;
    let aiScoreFromText: number | null = null;
    if (!offline) {
      try {
        // Provide a minimal DiffStat for typing: aggregate totals across the week
        const diff = { added: Math.max(0, ins), removed: Math.max(0, del), changed: 0 } as any;
        const aiText = await summarizeWithAI(diff, 0);
        // 支持 JSON 或 纯 Markdown
        try {
          const obj = JSON.parse(String(aiText));
          const md = obj?.markdown ?? obj?.summary ?? obj?.text;
          if (typeof md === 'string' && md.trim()) summary = md;
          const s = Number(obj?.score_ai ?? obj?.score);
          if (!Number.isNaN(s)) aiScoreFromText = Math.max(0, Math.min(100, Math.round(s)));
        } catch {
          summary = String(aiText || '').trim() || merged;
        }
      } catch (e) {
        if (logger.enabled.info) logger.info('week:ai:failed', { weekKey, error: (e as Error)?.message });
        // 失败回退为合并文案
      }
    }

    await this.db.setWeekRow(weekKey, {
      insertions: ins,
      deletions: del,
      baseScore: lastBase || 0,
      trend,
      summary,
      aiScore: offline ? null : (aiScoreFromText ?? aiAvg),
      localScore: locAvg,
      progressPercent: progAvg,
      lastGenAt: Date.now(),
    });

    const row = await this.db.getWeek(weekKey);
    if (logger.enabled.info) logger.info('week:summary:done', { weekKey, ins, del, baseScore: lastBase, trend });
    return row;
  }

  async generateMonthSummary(monthKey: string): Promise<any> {
    const cfg = await getConfig();
    const offline = !!(cfg as any)?.offlineMode;
    // 获取本月涉及的周
    const weeks = await this.db.getWeeksInMonth(monthKey);
    const parts: Array<{ date: string; text: string }> = [];
    let ins = 0, del = 0; let lastBase = 0;
    let aiSum = 0, aiCnt = 0; let locSum = 0, locCnt = 0; let progSum = 0, progCnt = 0;

    for (const wk of weeks) {
      let wrow = await this.db.getWeek(wk);
      // 若该周未生成周总结，回退用该周 7 天合并
      if (!wrow) {
        try { wrow = await this.generateWeekSummary(wk); } catch {}
      }
      if (wrow) {
        ins += Math.max(0, wrow.insertions || 0);
        del += Math.max(0, wrow.deletions || 0);
        lastBase = wrow.baseScore || lastBase;
        if (typeof wrow.aiScore === 'number') { aiSum += wrow.aiScore; aiCnt++; }
        if (typeof wrow.localScore === 'number') { locSum += wrow.localScore; locCnt++; }
        if (typeof wrow.progressPercent === 'number') { progSum += wrow.progressPercent; progCnt++; }
        parts.push({ date: wk, text: String((wrow.summary || '')).trim() });
      }
    }

    const aiAvg = aiCnt ? Math.round(aiSum / aiCnt) : null;
    const locAvg = locCnt ? Math.round(locSum / locCnt) : null;
    const progAvg = progCnt ? Math.round(progSum / progCnt) : null;

    // 趋势：与上月末 base 差
    let trend = 0;
    try {
      const parts = (monthKey || '').split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isFinite(y) || !Number.isFinite(m)) throw new Error('bad monthKey');
      const prevMonth = (m > 1) ? `${y}-${String(m - 1).padStart(2, '0')}` : `${(y - 1)}-12`;
      const prev = await this.db.getMonth(prevMonth);
      const prevBase = prev?.baseScore || 0;
      trend = Math.round((lastBase || 0) - prevBase);
    } catch {}

    const merged = formatMergedMarkdown(`月总结（${monthKey}）- 合并素材`, parts);
    let summary = merged;
    let aiScoreFromText: number | null = null;
    if (!offline) {
      try {
        // Provide a minimal DiffStat for typing: aggregate totals across the month
        const diff = { added: Math.max(0, ins), removed: Math.max(0, del), changed: 0 } as any;
        const aiText = await summarizeWithAI(diff, 0);
        try {
          const obj = JSON.parse(String(aiText));
          const md = obj?.markdown ?? obj?.summary ?? obj?.text;
          if (typeof md === 'string' && md.trim()) summary = md;
          const s = Number(obj?.score_ai ?? obj?.score);
          if (!Number.isNaN(s)) aiScoreFromText = Math.max(0, Math.min(100, Math.round(s)));
        } catch {
          summary = String(aiText || '').trim() || merged;
        }
      } catch (e) {
        if (logger.enabled.info) logger.info('month:ai:failed', { monthKey, error: (e as Error)?.message });
      }
    }

    await this.db.setMonthRow(monthKey, {
      insertions: ins,
      deletions: del,
      baseScore: lastBase || 0,
      trend,
      summary,
      aiScore: offline ? null : (aiScoreFromText ?? aiAvg),
      localScore: locAvg,
      progressPercent: progAvg,
      lastGenAt: Date.now(),
    });

    const row = await this.db.getMonth(monthKey);
    if (logger.enabled.info) logger.info('month:summary:done', { monthKey, ins, del, baseScore: lastBase, trend });
    return row;
  }
}
