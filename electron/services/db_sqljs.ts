import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { Database as SQLDatabase, SqlJsStatic } from 'sql.js';

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
  private sqlite!: SqlJsStatic;
  private db!: SQLDatabase;
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
    const baseScore = this.computeCumulativeBase(prevBase, ins, del);
    const trend = yesterday ? Math.round(baseScore - yesterday.baseScore) : 0;
    const exists = await this.getDay(date);
    if (!exists) {
      this.db.run(`INSERT INTO days(date, insertions, deletions, baseScore, trend, summary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, ins, del, baseScore, trend, null, now, now]);
    } else {
      this.db.run(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`,
        [ins, del, baseScore, trend, now, date]);
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
        // Load from node_modules during dev/build
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
        baseScore INTEGER NOT NULL DEFAULT 0,
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
    const next = Math.max(100, prevBase) + Math.max(0, dailyInc);
    return Math.round(next);
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
      const baseScore = this.computeCumulativeBase(prevBase, ins, del);
      const trend = yesterday ? Math.round(baseScore - yesterday.baseScore) : 0;
      this.db.run(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`,
        [ins, del, baseScore, trend, now, date]);
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

  async setDayMetrics(date: string, metrics: { aiScore?: number | null; localScore?: number | null; progressPercent?: number | null }) {
    await this.ready;
    const now = Date.now();
    const row = await this.getDay(date);
    if (!row) return; // ensure row exists before setting
    const ai = (metrics.aiScore ?? row.aiScore ?? null);
    const loc = (metrics.localScore ?? row.localScore ?? null);
    const prog = (metrics.progressPercent ?? row.progressPercent ?? null);
    this.db.run(`UPDATE days SET aiScore=?, localScore=?, progressPercent=?, updatedAt=? WHERE date=?`, [ai, loc, prog, now, date]);
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
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
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

function mapRow<T>(table: import('sql.js').QueryExecResult): T[] {
  const cols = table.columns;
  return table.values.map((arr: unknown[]) => {
    const obj: Record<string, unknown> = {};
    (arr as unknown[]).forEach((v: unknown, i: number) => { obj[cols[i]] = v; });
    return obj as T;
  });
}

function pickAgg(res: import('sql.js').QueryExecResult[] | undefined) {
  if (!res || !res[0] || !res[0].values[0]) return { ins: 0, del: 0, score: 0 };
  const row = mapRow<any>(res[0])[0];
  return { ins: Math.round(row.ins || 0), del: Math.round(row.del || 0), score: Math.round(row.avgScore || 0) };
}

function upsertAgg(db: SQLDatabase, table: 'weeks'|'months'|'years', keyCol: string, key: string, ins: number, del: number, score: number, now: number) {
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
