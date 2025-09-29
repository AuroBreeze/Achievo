import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DayRow = {
  date: string; // YYYY-MM-DD
  insertions: number;
  deletions: number;
  baseScore: number; // 基础分（根据插入/删除计算）
  trend: number; // 相比昨天的趋势（baseScore 差值）
  summary?: string | null; // AI 总结（人工触发后写入）
  createdAt: number;
  updatedAt: number;
};

export class DB {
  private db: Database.Database;

  constructor() {
    const file = path.join(app.getPath('userData'), 'achievo.sqlite3');
    this.db = new Database(file);
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        trend INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weeks (
        week TEXT PRIMARY KEY, -- ISO week key: YYYY-Www
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS months (
        month TEXT PRIMARY KEY, -- YYYY-MM
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS years (
        year TEXT PRIMARY KEY, -- YYYY
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        baseScore INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
  }

  private computeBaseScore(insertions: number, deletions: number): number {
    const raw = insertions * 2 + deletions * 1;
    const normalized = Math.min(100, Math.round((raw / Math.max(1, insertions + deletions)) * 50 + Math.min(50, insertions)));
    return Math.max(0, normalized);
  }

  getDay(date: string): DayRow | null {
    const row = this.db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as DayRow | undefined;
    return row || null;
  }

  getDaysRange(startDate: string, endDate: string): DayRow[] {
    const stmt = this.db.prepare(`SELECT * FROM days WHERE date BETWEEN ? AND ? ORDER BY date ASC`);
    return stmt.all(startDate, endDate) as DayRow[];
  }

  upsertDayAccumulate(date: string, deltaIns: number, deltaDel: number): DayRow {
    const now = Date.now();
    const existing = this.getDay(date);
    if (!existing) {
      const ins = Math.max(0, deltaIns);
      const del = Math.max(0, deltaDel);
      const baseScore = this.computeBaseScore(ins, del);
      // trend 相比昨天
      const y = this.getYesterday(date);
      const yesterday = y ? this.getDay(y) : null;
      const trend = yesterday ? baseScore - yesterday.baseScore : 0;
      this.db.prepare(`INSERT INTO days(date, insertions, deletions, baseScore, trend, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?)`)
        .run(date, ins, del, baseScore, trend, now, now);
      return this.getDay(date)!;
    } else {
      const ins = Math.max(0, existing.insertions + deltaIns);
      const del = Math.max(0, existing.deletions + deltaDel);
      const baseScore = this.computeBaseScore(ins, del);
      // trend 相比昨天，以新 baseScore 计算
      const y = this.getYesterday(date);
      const yesterday = y ? this.getDay(y) : null;
      const trend = yesterday ? baseScore - yesterday.baseScore : 0;
      this.db.prepare(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`)
        .run(ins, del, baseScore, trend, now, date);
      return this.getDay(date)!;
    }
  }

  setDaySummary(date: string, summary: string) {
    const now = Date.now();
    this.db.prepare(`UPDATE days SET summary=?, updatedAt=? WHERE date=?`).run(summary, now, date);
  }

  // Aggregations
  getWeekKey(date: string): string {
    const d = new Date(date + 'T00:00:00');
    // ISO week number
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  getMonthKey(date: string): string {
    return date.slice(0, 7); // YYYY-MM
  }

  getYearKey(date: string): string {
    return date.slice(0, 4); // YYYY
  }

  updateAggregatesForDate(date: string) {
    const now = Date.now();
    const weekKey = this.getWeekKey(date);
    const monthKey = this.getMonthKey(date);
    const yearKey = this.getYearKey(date);

    // Aggregate days for the week
    const weekInsDel = this.db.prepare(`
      SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore
      FROM days WHERE substr(date,1,4)||'-W'||printf('%02d',
        (cast((julianday(date) - julianday(strftime('%Y-01-04', date)) + 4) / 7 as int) + 1)
      ) = ?
    `).get(weekKey) as any;
    const wIns = weekInsDel?.ins || 0;
    const wDel = weekInsDel?.del || 0;
    const wScore = Math.round(weekInsDel?.avgScore || 0);
    const wExists = this.db.prepare(`SELECT 1 FROM weeks WHERE week=?`).get(weekKey);
    if (!wExists) this.db.prepare(`INSERT INTO weeks(week, insertions, deletions, baseScore, createdAt, updatedAt) VALUES(?,?,?,?,?,?)`).run(weekKey, wIns, wDel, wScore, now, now);
    else this.db.prepare(`UPDATE weeks SET insertions=?, deletions=?, baseScore=?, updatedAt=? WHERE week=?`).run(wIns, wDel, wScore, now, weekKey);

    // Aggregate days for the month
    const monthAgg = this.db.prepare(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore FROM days WHERE substr(date,1,7)=?`).get(monthKey) as any;
    const mIns = monthAgg?.ins || 0;
    const mDel = monthAgg?.del || 0;
    const mScore = Math.round(monthAgg?.avgScore || 0);
    const mExists = this.db.prepare(`SELECT 1 FROM months WHERE month=?`).get(monthKey);
    if (!mExists) this.db.prepare(`INSERT INTO months(month, insertions, deletions, baseScore, createdAt, updatedAt) VALUES(?,?,?,?,?,?)`).run(monthKey, mIns, mDel, mScore, now, now);
    else this.db.prepare(`UPDATE months SET insertions=?, deletions=?, baseScore=?, updatedAt=? WHERE month=?`).run(mIns, mDel, mScore, now, monthKey);

    // Aggregate days for the year
    const yearAgg = this.db.prepare(`SELECT SUM(insertions) AS ins, SUM(deletions) AS del, AVG(baseScore) AS avgScore FROM days WHERE substr(date,1,4)=?`).get(yearKey) as any;
    const yIns = yearAgg?.ins || 0;
    const yDel = yearAgg?.del || 0;
    const yScore = Math.round(yearAgg?.avgScore || 0);
    const yExists = this.db.prepare(`SELECT 1 FROM years WHERE year=?`).get(yearKey);
    if (!yExists) this.db.prepare(`INSERT INTO years(year, insertions, deletions, baseScore, createdAt, updatedAt) VALUES(?,?,?,?,?,?)`).run(yearKey, yIns, yDel, yScore, now, now);
    else this.db.prepare(`UPDATE years SET insertions=?, deletions=?, baseScore=?, updatedAt=? WHERE year=?`).run(yIns, yDel, yScore, now, yearKey);
  }

  getYesterday(date: string): string | null {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
