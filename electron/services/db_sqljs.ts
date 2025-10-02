import { app } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { calcProgressPercentComplex } from './progressCalculator';
import type { Database as SQLDatabase } from 'sql.js';

// Daily increment cap ratio relative to yesterday's base (e.g., 0.2 = 20%)
const DAILY_CAP_RATIO = 0.2;

export type DayRow = {
  date: string; // YYYY-MM-DD
  insertions: number;
  deletions: number;
  baseScore: number; // 基础分
  trend: number; // 与昨天的差值
  summary?: string | null;
  aiScore?: number | null;
  localScore?: number | null;
  progressPercent?: number | null;
  // meta
  aiModel?: string | null;
  aiProvider?: string | null;
  aiTokens?: number | null; // total tokens
  aiDurationMs?: number | null; // total duration for summary generation
  chunksCount?: number | null;
  lastGenAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export class DB {
  // Use broader types to avoid TS namespace typing issues across environments
  private sqlite!: any;
  private db!: any;
  private filePath: string;
  private ready: Promise<void>;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'achievo.sqljs');
    this.ready = this.init();
  }

  async setDayAiMeta(date: string, meta: { aiModel?: string | null; aiProvider?: string | null; aiTokens?: number | null; aiDurationMs?: number | null; chunksCount?: number | null; lastGenAt?: number | null }) {
    await this.ready;
    const now = Date.now();
    const row = await this.getDay(date);
    if (!row) return;
    const model = meta.aiModel ?? row.aiModel ?? null;
    const provider = meta.aiProvider ?? row.aiProvider ?? null;
    const tokens = (typeof meta.aiTokens === 'number') ? meta.aiTokens : (row.aiTokens ?? null);
    const dur = (typeof meta.aiDurationMs === 'number') ? meta.aiDurationMs : (row.aiDurationMs ?? null);
    const chunks = (typeof meta.chunksCount === 'number') ? meta.chunksCount : (row.chunksCount ?? null);
    const genAt = (typeof meta.lastGenAt === 'number') ? meta.lastGenAt : (row.lastGenAt ?? null);
    this.db.run(`UPDATE days SET aiModel=?, aiProvider=?, aiTokens=?, aiDurationMs=?, chunksCount=?, lastGenAt=?, updatedAt=? WHERE date=?`, [model, provider, tokens, dur, chunks, genAt, now, date]);
    await this.persist();
  }

  async setDayCounts(date: string, insertions: number, deletions: number) {
    await this.ready;
    const now = Date.now();
    const ins = Math.max(0, Math.round(insertions));
    const del = Math.max(0, Math.round(deletions));
    const y = this.getYesterday(date);
    const yesterday = y ? await this.getDay(y) : null;
    const prevBase = Math.max(100, yesterday?.baseScore || 100);
    const baseCandidate = this.computeCumulativeBase(prevBase, ins, del);
    const exists = await this.getDay(date);
    if (!exists) {
      const trend = yesterday ? Math.round(baseCandidate - yesterday.baseScore) : 0;
      // progressPercent derives from complex model using existing (null) ai/local as 0
      const hasChanges = (ins + del) > 0;
      const progressPercent = calcProgressPercentComplex({
        trend,
        prevBase,
        localScore: 0,
        aiScore: 0,
        totalChanges: ins + del,
        hasChanges,
        cap: 25,
      });
      this.db.run(`INSERT INTO days(date, insertions, deletions, baseScore, trend, progressPercent, summary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, ins, del, baseCandidate, trend, progressPercent, null, now, now]);
    } else {
      // If today's summary has been generated (lastGenAt present), do NOT mutate baseScore here.
      // Summary becomes authoritative for today's base/trend.
      if (typeof exists.lastGenAt === 'number') {
        const keepBase = Math.max(100, exists.baseScore || 0);
        const trend = yesterday ? Math.round(keepBase - yesterday.baseScore) : 0;
        const hasChanges = (ins + del) > 0;
        const progressPercent = calcProgressPercentComplex({
          trend,
          prevBase,
          localScore: Math.max(0, exists.localScore ?? 0),
          aiScore: Math.max(0, exists.aiScore ?? 0),
          totalChanges: ins + del,
          hasChanges,
          cap: 25,
        });
        this.db.run(`UPDATE days SET insertions=?, deletions=?, trend=?, progressPercent=?, updatedAt=? WHERE date=?`,
          [ins, del, trend, progressPercent, now, date]);
      } else {
        // Do not let baseScore regress due to periodic line-only recomputation
        const safeBase = Math.max(Math.max(100, exists.baseScore || 0), baseCandidate);
        const trend = yesterday ? Math.round(safeBase - yesterday.baseScore) : 0;
        const hasChanges = (ins + del) > 0;
        const progressPercent = calcProgressPercentComplex({
          trend,
          prevBase,
          localScore: Math.max(0, exists.localScore ?? 0),
          aiScore: Math.max(0, exists.aiScore ?? 0),
          totalChanges: ins + del,
          hasChanges,
          cap: 25,
        });
        this.db.run(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, progressPercent=?, updatedAt=? WHERE date=?`,
          [ins, del, safeBase, trend, progressPercent, now, date]);
      }
    }
    await this.persist();
  }

  async getTotals(): Promise<{ insertions: number; deletions: number; total: number }> {
    await this.ready;
    const res = this.db.exec(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del FROM days`);
    if (!res[0] || !res[0].values[0]) return { insertions: 0, deletions: 0, total: 0 };
    const row = mapRow<any>(res[0])[0];
    const ins = Math.round(row.ins || 0);
    const del = Math.round(row.del || 0);
    return { insertions: ins, deletions: del, total: ins + del };
  }

  private async init() {
    this.sqlite = await initSqlJs({
      locateFile: (file: string) => {
        // Packaged: prefer unpacked resources; Dev: use project node_modules
        if ((process as any).resourcesPath && app.isPackaged) {
          const unpacked = path.join(process.resourcesPath as string, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
          if (fsSync.existsSync(unpacked)) return unpacked;
          const resAlt = path.join(process.resourcesPath as string, 'sql.js', 'dist', file);
          if (fsSync.existsSync(resAlt)) return resAlt;
        }
        // Dev fallback
        return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
      },
    });
    let buf: Uint8Array | undefined;
    try {
      const data = await fs.readFile(this.filePath);
      buf = new Uint8Array(data);
    } catch {}
    this.db = new this.sqlite.Database(buf);
    this.migrate();
  }

  private migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 100,
        trend INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        aiScore INTEGER,
        localScore INTEGER,
        progressPercent INTEGER,
        aiModel TEXT,
        aiProvider TEXT,
        aiTokens INTEGER,
        aiDurationMs INTEGER,
        chunksCount INTEGER,
        lastGenAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weeks (
        week TEXT PRIMARY KEY,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS months (
        month TEXT PRIMARY KEY,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS years (
        year TEXT PRIMARY KEY,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
    // Defensive add columns for existing DBs (ignore if already exists)
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN localScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN progressPercent INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiModel TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiProvider TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiTokens INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiDurationMs INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN chunksCount INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN lastGenAt INTEGER`); } catch {}
    this.persist();
  }

  private async persist() {
    const data = this.db.export();
    await fs.writeFile(this.filePath, Buffer.from(data));
  }

  private computeCumulativeBase(prevBase: number, insertions: number, deletions: number): number {
    // Daily increment with diminishing returns
    const wAdded = 1.6;
    const wRemoved = 0.8;
    const raw = Math.max(0, insertions) * wAdded + Math.max(0, deletions) * wRemoved;
    const alpha = 220;
    const dailyInc = 100 * (1 - Math.exp(-raw / alpha)); // 0..~100 increment
    const base0 = Math.max(100, prevBase);
    // Cap the daily increase to DAILY_CAP_RATIO of previous base
    const incCapped = Math.min(Math.max(0, dailyInc), base0 * DAILY_CAP_RATIO);
    // 避免极小正增量被四舍五入为 0
    const incApplied = incCapped > 0 && incCapped < 1 ? 1 : Math.round(incCapped);
    const next = base0 + incApplied;
    try { console.debug('[DB] computeCumulativeBase', { prevBase: base0, insertions, deletions, dailyInc: Math.round(dailyInc), cap: base0 * DAILY_CAP_RATIO, applied: incApplied, next }); } catch {}
    return next;
  }

  async getDay(date: string): Promise<DayRow | null> {
    await this.ready;
    const res = this.db.exec(`SELECT * FROM days WHERE date = '${date.replace(/'/g, "''")}' LIMIT 1`);
    if (!res[0]) return null;
    const row = mapRow<DayRow>(res[0])[0];
    return row || null;
  }

  async getDaysRange(startDate: string, endDate: string): Promise<DayRow[]> {
    await this.ready;
    const res = this.db.exec(`SELECT * FROM days WHERE date BETWEEN '${startDate}' AND '${endDate}' ORDER BY date ASC`);
    if (!res[0]) return [];
    return mapRow<DayRow>(res[0]);
  }

  async upsertDayAccumulate(date: string, deltaIns: number, deltaDel: number): Promise<DayRow> {
    await this.ready;
    const now = Date.now();
    const existing = await this.getDay(date);
    if (!existing) {
      const ins = Math.max(0, deltaIns);
      const del = Math.max(0, deltaDel);
      const y = this.getYesterday(date);
      const yesterday = y ? await this.getDay(y) : null;
      const prevBase = Math.max(100, yesterday?.baseScore || 100);
      const baseScore = this.computeCumulativeBase(prevBase, ins, del);
      const trend = yesterday ? Math.round(baseScore - yesterday.baseScore) : 0;
      this.db.run(`INSERT INTO days(date, insertions, deletions, baseScore, trend, summary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, ins, del, baseScore, trend, null, now, now]);
      await this.persist();
      return (await this.getDay(date))!;
    } else {
      const ins = Math.max(0, existing.insertions + deltaIns);
      const del = Math.max(0, existing.deletions + deltaDel);
      const y = this.getYesterday(date);
      const yesterday = y ? await this.getDay(y) : null;
      const prevBase = Math.max(100, yesterday?.baseScore || 100);
      const baseCandidate = this.computeCumulativeBase(prevBase, ins, del);
      const safeBase = Math.max(Math.max(100, existing.baseScore || 0), baseCandidate);
      const trend = yesterday ? Math.round(safeBase - yesterday.baseScore) : 0;
      this.db.run(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`,
        [ins, del, safeBase, trend, now, date]);
      await this.persist();
      return (await this.getDay(date))!;
    }
  }

  async setDaySummary(date: string, summary: string) {
    await this.ready;
    const now = Date.now();
    this.db.run(`UPDATE days SET summary=?, updatedAt=? WHERE date=?`, [summary, now, date]);
    await this.persist();
  }

  async setDayMetrics(date: string, metrics: { aiScore?: number | null; localScore?: number | null; progressPercent?: number | null }, opts?: { overwriteToday?: boolean }) {
    await this.ready;
    const now = Date.now();
    const row = await this.getDay(date);
    if (!row) return; // ensure row exists before setting
    const ai = (metrics.aiScore ?? row.aiScore ?? null);
    const loc = (metrics.localScore ?? row.localScore ?? null);
    const prog = (metrics.progressPercent ?? row.progressPercent ?? null);

    // Recompute baseScore with reduced reliance on line counts and stronger link to AI/local scores
    // Hybrid daily increment components（取消按昨日基准的 25% 封顶）：
    // - Lines component (lower weight): ins*0.8 + del*0.4 with diminishing returns, ~0..60
    // - AI component: up to 30 points (aiScore 0..100 -> 0..30)
    // - Local component: absolute contribution up to 40 points
    const yKey = this.getYesterday(date);
    const y = yKey ? await this.getDay(yKey) : null;
    const prevBase = Math.max(100, y?.baseScore || 100);
    const ins = Math.max(0, row.insertions || 0);
    const del = Math.max(0, row.deletions || 0);
    const rawLines = ins * 0.8 + del * 0.4;
    const incLines = 60 * (1 - Math.exp(-rawLines / 300));
    const aiPart = Math.max(0, Math.min(30, (typeof ai === 'number' ? ai : 0) * 0.3));
    // Absolute local contribution (0..40), decoupled from prevBase to avoid always-0 when prevBase is high
    const locAbs = Math.max(0, Math.min(100, (typeof loc === 'number' ? loc : 0)));
    const incLocal = Math.max(0, Math.min(40, locAbs * 0.4));
    const dailyInc = incLines + aiPart + incLocal;
    // When overwriting today (from summary), start from prevBase to allow lowering from a previously higher base
    const currentBase = opts?.overwriteToday ? prevBase : Math.max(prevBase, Math.max(100, row.baseScore || 0));
    // Limit total daily gain to DAILY_CAP_RATIO of yesterday's base, accounting for any gain already applied today
    const maxDailyAllowance = prevBase * DAILY_CAP_RATIO;
    const alreadyGained = Math.max(0, currentBase - prevBase);
    const remainingAllowance = Math.max(0, maxDailyAllowance - alreadyGained);
    const incCapped = Math.min(Math.max(0, dailyInc), remainingAllowance);
    const incApplied = incCapped > 0 && incCapped < 1 ? 1 : Math.round(incCapped);
    const nextBase = currentBase + incApplied;
    try {
      console.debug('[DB] setDayMetrics cap', {
        date,
        prevBase,
        currentBase,
        ins,
        del,
        incLines: Math.round(incLines),
        aiPart: Math.round(aiPart),
        incLocal: Math.round(incLocal),
        dailyInc: Math.round(dailyInc),
        maxDailyAllowance: Math.round(maxDailyAllowance),
        alreadyGained: Math.round(alreadyGained),
        remainingAllowance: Math.round(remainingAllowance),
        incApplied,
        nextBase,
      });
    } catch {}
    const trend = y ? Math.round(nextBase - (y.baseScore || 0)) : incApplied;

    this.db.run(`UPDATE days SET aiScore=?, localScore=?, progressPercent=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`, [ai, loc, prog, nextBase, trend, now, date]);
    await this.persist();
  }

  async setDayBaseScore(date: string, baseScore: number) {
    await this.ready;
    const now = Date.now();
    const y = this.getYesterday(date);
    const yesterday = y ? await this.getDay(y) : null;
    const trend = yesterday ? Math.round(baseScore - yesterday.baseScore) : 0;
    this.db.run(`UPDATE days SET baseScore=?, trend=?, updatedAt=? WHERE date=?`, [
      Math.max(0, Math.min(100, Math.round(baseScore))), trend, now, date
    ]);
    await this.persist();
  }

  async updateAggregatesForDate(date: string) {
    await this.ready;
    const now = Date.now();
    const weekKey = this.getWeekKey(date);
    const monthKey = this.getMonthKey(date);
    const yearKey = this.getYearKey(date);

    // week: compute monday..sunday range for the ISO week of 'date'
    const weekRange = getIsoWeekRange(date);
    const weekAgg = this.db.exec(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore FROM days WHERE date BETWEEN '${weekRange.start}' AND '${weekRange.end}'`);
    const w = pickAgg(weekAgg);
    upsertAgg(this.db, 'weeks', 'week', weekKey, w.ins, w.del, w.score, now);

    // month
    const monthAgg = this.db.exec(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore FROM days WHERE substr(date,1,7)='${monthKey}'`);
    const m = pickAgg(monthAgg);
    upsertAgg(this.db, 'months', 'month', monthKey, m.ins, m.del, m.score, now);

    // year
    const yearAgg = this.db.exec(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore FROM days WHERE substr(date,1,4)='${yearKey}'`);
    const y = pickAgg(yearAgg);
    upsertAgg(this.db, 'years', 'year', yearKey, y.ins, y.del, y.score, now);

    await this.persist();
  }

  getYesterday(date: string): string | null {
    // Interpret input as local date and return previous local day in YYYY-MM-DD without UTC conversion
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  getWeekKey(date: string): string {
    const d = new Date(date + 'T00:00:00');
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  getMonthKey(date: string): string {
    return date.slice(0, 7);
  }

  getYearKey(date: string): string {
    return date.slice(0, 4);
  }
}

function mapRow<T>(table: any): T[] {
  const cols = table.columns;
  return table.values.map((arr: unknown[]) => {
    const obj: Record<string, unknown> = {};
    (arr as unknown[]).forEach((v: unknown, i: number) => { obj[cols[i]] = v; });
    return obj as T;
  });
}

function pickAgg(res: any[] | undefined) {
  if (!res || !res[0] || !res[0].values[0]) return { ins: 0, del: 0, score: 0 };
  const row = mapRow<any>(res[0])[0];
  return { ins: Math.round(row.ins || 0), del: Math.round(row.del || 0), score: Math.round(row.avgScore || 0) };
}

function upsertAgg(db: any, table: 'weeks'|'months'|'years', keyCol: string, key: string, ins: number, del: number, score: number, now: number) {
  const exists = db.exec(`SELECT 1 FROM ${table} WHERE ${keyCol}='${key}' LIMIT 1`);
  if (!exists[0]) {
    db.run(`INSERT INTO ${table}(${keyCol}, insertions, deletions, baseScore, createdAt, updatedAt) VALUES(?,?,?,?,?,?)`, [key, ins, del, score, now, now]);
  } else {
    db.run(`UPDATE ${table} SET insertions=?, deletions=?, baseScore=?, updatedAt=? WHERE ${keyCol}=?`, [ins, del, score, now, key]);
  }
}

function getIsoWeekRange(date: string): { start: string; end: string } {
  const d = new Date(date + 'T00:00:00');
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // Monday=0
  // Monday of current ISO week
  const monday = new Date(tmp);
  monday.setUTCDate(tmp.getUTCDate() - dayNum);
  // Sunday of current ISO week
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toKey = (x: Date) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())).toISOString().slice(0, 10);
  return { start: toKey(monday), end: toKey(sunday) };
}
