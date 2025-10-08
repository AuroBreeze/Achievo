import { app } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { calcProgressPercentComplex } from './progressCalculator';
import { computeBaseUpdate } from './baseScoreEngine';
import { getConfig } from './config';
import type { Database as SQLDatabase } from 'sql.js';
import { getLogger } from './logger';

// Default daily cap ratio relative to yesterday's base when config is missing
const DEFAULT_DAILY_CAP_RATIO = 0.35;

export type DayRow = {
  date: string; // YYYY-MM-DD
  insertions: number;
  deletions: number;
  baseScore: number; // 基础分
  trend: number; // 与昨天的差值
  summary?: string | null;
  aiScore?: number | null;
  localScore?: number | null;
  localScoreRaw?: number | null;
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
  private logger = getLogger('db');
  // 序列化持久化，避免并发写入交错覆盖
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(opts?: { repoPath?: string; name?: string }) {
    // Resolve install root: exe directory in packaged app; project cwd in dev
    const installRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
    const dbDir = path.join(installRoot, 'db');
    try { if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true }); } catch {}
    // Derive db file name: default achievo.sqljs; if repoPath provided, use a hashed/sanitized variant
    const fileName = (() => {
      // 优先使用显式名称
      if (opts?.name && opts.name.trim()) return `${sanitizeFile(opts.name.trim())}.sqljs`;
      const repo = opts?.repoPath;
      if (repo && repo.trim()) {
        const base = sanitizeFile(repo.trim());
        const hash = simpleHash(repo.trim());
        return `achievo_${base.slice(-24)}_${hash}.sqljs`;
      }
      return 'achievo.sqljs';
    })();
    this.filePath = path.join(dbDir, fileName);
    this.ready = this.init();
  }

  getFilePath(): string {
    return this.filePath;
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

  // Transaction-like batched update for a single date. Applies counts, metrics, summary, and AI meta,
  // then updates aggregates, and finally persists ONCE to minimize race windows.
  async applyTodayUpdate(date: string, opts: {
    counts?: { insertions: number; deletions: number }; // totals since date, not deltas
    metrics?: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null };
    summary?: string | null;
    aiMeta?: { aiModel?: string | null; aiProvider?: string | null; aiTokens?: number | null; aiDurationMs?: number | null; chunksCount?: number | null; lastGenAt?: number | null };
    overwriteToday?: boolean; // recompute base/trend from prevBase
    mergeByMax?: boolean; // when true, take maxima when merging counts/metrics
  }) {
    await this.ready;
    const now = Date.now();
    const existing = await this.getDay(date);
    const yKey = this.getYesterday(date);
    const y = yKey ? await this.getDay(yKey) : null;
    const prevBase = Math.max(100, y?.baseScore || 100);

    // 1) Determine counts to apply (totals semantics)
    let ins = existing?.insertions || 0;
    let del = existing?.deletions || 0;
    if (opts.counts) {
      const tin = Math.max(0, Math.round(opts.counts.insertions || 0));
      const tdel = Math.max(0, Math.round(opts.counts.deletions || 0));
      if (existing) {
        if (opts.mergeByMax) { ins = Math.max(ins, tin); del = Math.max(del, tdel); }
        else { ins = tin; del = tdel; }
      } else {
        ins = tin; del = tdel;
      }
    }

    // 2) Decide baseScore/trend/progressPercent
    let aiScore = (existing?.aiScore ?? null) as number | null;
    let localScore = (existing?.localScore ?? null) as number | null;
    let localScoreRaw = (existing?.localScoreRaw ?? null) as number | null;
    let progressPercent = (existing?.progressPercent ?? null) as number | null;
    if (opts.metrics) {
      const m = opts.metrics;
      const mAi = (typeof m.aiScore === 'number') ? m.aiScore : aiScore;
      const mLocal = (typeof m.localScore === 'number') ? m.localScore : localScore;
      const mRaw = (typeof m.localScoreRaw === 'number') ? m.localScoreRaw : localScoreRaw;
      const mProg = (typeof m.progressPercent === 'number') ? m.progressPercent : progressPercent;
      if (opts.mergeByMax) {
        aiScore = (aiScore === null) ? (typeof mAi === 'number' ? mAi : null) : Math.max(aiScore, (typeof mAi === 'number' ? mAi : aiScore));
        localScore = (localScore === null) ? (typeof mLocal === 'number' ? mLocal : null) : Math.max(localScore, (typeof mLocal === 'number' ? mLocal : localScore));
        progressPercent = (progressPercent === null) ? (typeof mProg === 'number' ? mProg : null) : Math.max(progressPercent, (typeof mProg === 'number' ? mProg : progressPercent));
        localScoreRaw = (typeof mRaw === 'number') ? mRaw : localScoreRaw;
      } else {
        aiScore = (typeof mAi === 'number') ? mAi : aiScore;
        localScore = (typeof mLocal === 'number') ? mLocal : localScore;
        progressPercent = (typeof mProg === 'number') ? mProg : progressPercent;
        localScoreRaw = (typeof mRaw === 'number') ? mRaw : localScoreRaw;
      }
    }

    const cfg = await getConfig();
    const ratio = Number.isFinite(cfg.dailyCapRatio as any) ? Math.max(0, Math.min(1, (cfg.dailyCapRatio as number))) : DEFAULT_DAILY_CAP_RATIO;
    const hasChanges = (ins + del) > 0;

    // Compute base/trend according to overwriteToday & lastGenAt rules
    let baseScore = existing ? Math.max(100, existing.baseScore || 0) : 100;
    let trend = existing ? (existing.trend || 0) : 0;
    const lastGen = existing?.lastGenAt ?? null;
    if (!existing) {
      const res = computeBaseUpdate({ prevBase, currentBase: prevBase, insertions: ins, deletions: del, aiScore: 0, localScore: 0, cfg: { dailyCapRatio: ratio } });
      baseScore = res.nextBase;
      trend = y ? Math.round(baseScore - (y.baseScore || 0)) : (res.debug?.incApplied ?? 0);
      if (progressPercent === null || typeof progressPercent !== 'number') {
        progressPercent = calcProgressPercentComplex({ trend, prevBase, localScore: 0, aiScore: 0, totalChanges: ins + del, hasChanges, cap: 25 });
      }
    } else if (lastGen && !opts.overwriteToday) {
      // keep base after summary; recompute trend only
      baseScore = Math.max(100, existing.baseScore || 0);
      trend = Math.round(baseScore - prevBase);
      // keep existing progressPercent stable unless explicitly provided
    } else {
      const currentBase = Math.max(prevBase, Math.max(100, existing.baseScore || 0));
      const res = computeBaseUpdate({ prevBase, currentBase, insertions: ins, deletions: del, aiScore: Math.max(0, aiScore ?? 0), localScore: Math.max(0, localScore ?? 0), cfg: { dailyCapRatio: ratio } });
      const nextBase = Math.max(currentBase, res.nextBase);
      baseScore = nextBase;
      trend = y ? Math.round(nextBase - (y.baseScore || 0)) : (res.debug?.incApplied ?? 0);
      if (progressPercent === null || typeof progressPercent !== 'number') {
        progressPercent = calcProgressPercentComplex({ trend, prevBase, localScore: Math.max(0, localScore ?? 0), aiScore: Math.max(0, aiScore ?? 0), totalChanges: ins + del, hasChanges, cap: 25 });
      }
    }

    // 3) Upsert row with consolidated values
    if (!existing) {
      this.db.run(`INSERT INTO days(date, insertions, deletions, baseScore, trend, progressPercent, summary, aiScore, localScore, localScoreRaw, aiModel, aiProvider, aiTokens, aiDurationMs, chunksCount, lastGenAt, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        date, ins, del, baseScore, trend, (progressPercent ?? null), (opts.summary ?? null), (aiScore ?? null), (localScore ?? null), (localScoreRaw ?? null), (opts.aiMeta?.aiModel ?? null), (opts.aiMeta?.aiProvider ?? null), (opts.aiMeta?.aiTokens ?? null), (opts.aiMeta?.aiDurationMs ?? null), (opts.aiMeta?.chunksCount ?? null), (opts.aiMeta?.lastGenAt ?? null), now, now,
      ]);
    } else {
      // build UPDATE dynamically
      const cols: string[] = [];
      const vals: any[] = [];
      cols.push('insertions=?'); vals.push(ins);
      cols.push('deletions=?'); vals.push(del);
      cols.push('updatedAt=?'); vals.push(now);
      if (typeof baseScore === 'number') { cols.push('baseScore=?'); vals.push(Math.round(baseScore)); }
      if (typeof trend === 'number') { cols.push('trend=?'); vals.push(Math.round(trend)); }
      if (opts.summary !== undefined) { cols.push('summary=?'); vals.push(opts.summary ?? null); }
      if (aiScore !== undefined) { cols.push('aiScore=?'); vals.push(aiScore ?? null); }
      if (localScore !== undefined) { cols.push('localScore=?'); vals.push(localScore ?? null); }
      if (localScoreRaw !== undefined) { cols.push('localScoreRaw=?'); vals.push(localScoreRaw ?? null); }
      if (progressPercent !== undefined) { cols.push('progressPercent=?'); vals.push(progressPercent ?? null); }
      if (opts.aiMeta) {
        const m = opts.aiMeta;
        if ('aiModel' in m) { cols.push('aiModel=?'); vals.push(m.aiModel ?? null); }
        if ('aiProvider' in m) { cols.push('aiProvider=?'); vals.push(m.aiProvider ?? null); }
        if ('aiTokens' in m) { cols.push('aiTokens=?'); vals.push(m.aiTokens ?? null); }
        if ('aiDurationMs' in m) { cols.push('aiDurationMs=?'); vals.push(m.aiDurationMs ?? null); }
        if ('chunksCount' in m) { cols.push('chunksCount=?'); vals.push(m.chunksCount ?? null); }
        if ('lastGenAt' in m) { cols.push('lastGenAt=?'); vals.push(m.lastGenAt ?? null); }
      }
      cols.push('date=?'); vals.push(date);
      this.db.run(`UPDATE days SET ${cols.join(', ')} WHERE date=?`, vals);
    }

    // 4) Aggregates once at end
    await this.updateAggregatesForDate(date);
    // 5) Single persist (updateAggregates already persists, but call persist again to ensure durability in queue)
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
    const cfg = await getConfig();
    const ratio = Number.isFinite(cfg.dailyCapRatio as any) ? Math.max(0, Math.min(1, (cfg.dailyCapRatio as number))) : DEFAULT_DAILY_CAP_RATIO;
    const exists = await this.getDay(date);
    if (!exists) {
      // compute next base from prevBase with today's lines only, no ai/local at this point
      const res = computeBaseUpdate({
        prevBase,
        currentBase: prevBase,
        insertions: ins,
        deletions: del,
        aiScore: 0,
        localScore: 0,
        cfg: { dailyCapRatio: ratio },
      });
      const nextBase = res.nextBase;
      const trend = yesterday ? Math.round(nextBase - yesterday.baseScore) : (res.debug?.incApplied ?? 0);
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
        [date, ins, del, nextBase, trend, progressPercent, null, now, now]);
    } else {
      // If today's summary has been generated (lastGenAt present), do NOT mutate baseScore here.
      // Summary becomes authoritative for today's base/trend/progressPercent.
      if (typeof exists.lastGenAt === 'number') {
        const keepBase = Math.max(100, exists.baseScore || 0);
        const prevBase = Math.max(100, yesterday?.baseScore || 100);
        const trend = Math.round(keepBase - prevBase);
        // 保持 progressPercent 不变，避免已生成摘要后的 UI 百分比抖动
        this.db.run(`UPDATE days SET insertions=?, deletions=?, trend=?, updatedAt=? WHERE date=?`,
          [ins, del, trend, now, date]);
      } else {
        const currentBase = Math.max(prevBase, Math.max(100, exists.baseScore || 0));
        const res = computeBaseUpdate({
          prevBase,
          currentBase,
          insertions: ins,
          deletions: del,
          aiScore: Math.max(0, exists.aiScore ?? 0),
          localScore: Math.max(0, exists.localScore ?? 0),
          cfg: { dailyCapRatio: ratio },
        });
        // Do not let baseScore regress; keep at least currentBase
        const nextBase = Math.max(currentBase, res.nextBase);
        const trend = yesterday ? Math.round(nextBase - yesterday.baseScore) : (res.debug?.incApplied ?? 0);
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
          [ins, del, nextBase, trend, progressPercent, now, date]);
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
        localScoreRaw INTEGER,
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
      CREATE TABLE IF NOT EXISTS months (
        month TEXT PRIMARY KEY,
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
    try { this.db.run(`ALTER TABLE days ADD COLUMN localScoreRaw INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN progressPercent INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiModel TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiProvider TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiTokens INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN aiDurationMs INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN chunksCount INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE days ADD COLUMN lastGenAt INTEGER`); } catch {}
    // weeks/months alignment
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN trend INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN aiScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN localScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN progressPercent INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN aiModel TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN aiProvider TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN aiTokens INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN aiDurationMs INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN chunksCount INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE weeks ADD COLUMN lastGenAt INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN trend INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN aiScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN localScore INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN progressPercent INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN aiModel TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN aiProvider TEXT`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN aiTokens INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN aiDurationMs INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN chunksCount INTEGER`); } catch {}
    try { this.db.run(`ALTER TABLE months ADD COLUMN lastGenAt INTEGER`); } catch {}
    this.persist();
  }

  private async persist() {
    // 将 export+write 放入队列中执行，确保顺序且使用队列执行时的最新快照
    this.persistQueue = this.persistQueue.then(async () => {
      const data = this.db.export();
      await fs.writeFile(this.filePath, Buffer.from(data));
    }).catch(() => { /* ignore persist error to keep队列不中断 */ });
    return this.persistQueue;
  }

  // computeCumulativeBase removed; base progression is handled by baseScoreEngine.computeBaseUpdate

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

  // ===== 周/月 辅助方法 =====
  async getWeek(weekKey: string): Promise<any | null> {
    await this.ready;
    const res = this.db.exec(`SELECT * FROM weeks WHERE week='${weekKey.replace(/'/g, "''")}' LIMIT 1`);
    if (!res[0]) return null;
    return mapRow<any>(res[0])[0] || null;
  }

  async setWeekRow(weekKey: string, data: Partial<DayRow> & { insertions?: number; deletions?: number; }): Promise<void> {
    await this.ready;
    const now = Date.now();
    const exists = this.db.exec(`SELECT 1 FROM weeks WHERE week='${weekKey.replace(/'/g, "''")}' LIMIT 1`);
    const cols = ['insertions','deletions','baseScore','trend','summary','aiScore','localScore','progressPercent','aiModel','aiProvider','aiTokens','aiDurationMs','chunksCount','lastGenAt'];
    const vals: any[] = cols.map(k => (data as any)[k] ?? null);
    if (!exists[0]) {
      this.db.run(`INSERT INTO weeks(week, ${cols.join(',')}, createdAt, updatedAt) VALUES(?, ${cols.map(()=>'?').join(',')}, ?, ?)`, [weekKey, ...vals, now, now]);
    } else {
      this.db.run(`UPDATE weeks SET ${cols.map(c=>`${c}=?`).join(',')}, updatedAt=? WHERE week=?`, [...vals, now, weekKey]);
    }
    await this.persist();
  }

  async getMonth(monthKey: string): Promise<any | null> {
    await this.ready;
    const res = this.db.exec(`SELECT * FROM months WHERE month='${monthKey.replace(/'/g, "''")}' LIMIT 1`);
    if (!res[0]) return null;
    return mapRow<any>(res[0])[0] || null;
  }

  async setMonthRow(monthKey: string, data: Partial<DayRow> & { insertions?: number; deletions?: number; }): Promise<void> {
    await this.ready;
    const now = Date.now();
    const exists = this.db.exec(`SELECT 1 FROM months WHERE month='${monthKey.replace(/'/g, "''")}' LIMIT 1`);
    const cols = ['insertions','deletions','baseScore','trend','summary','aiScore','localScore','progressPercent','aiModel','aiProvider','aiTokens','aiDurationMs','chunksCount','lastGenAt'];
    const vals: any[] = cols.map(k => (data as any)[k] ?? null);
    if (!exists[0]) {
      this.db.run(`INSERT INTO months(month, ${cols.join(',')}, createdAt, updatedAt) VALUES(?, ${cols.map(()=>'?').join(',')}, ?, ?)`, [monthKey, ...vals, now, now]);
    } else {
      this.db.run(`UPDATE months SET ${cols.map(c=>`${c}=?`).join(',')}, updatedAt=? WHERE month=?`, [...vals, now, monthKey]);
    }
    await this.persist();
  }

  async getWeeksInMonth(monthKey: string): Promise<string[]> {
    await this.ready;
    const res = this.db.exec(`SELECT date FROM days WHERE substr(date,1,7)='${monthKey}'`);
    if (!res[0]) return [];
    const rows = mapRow<{date: string}>(res[0]);
    const keys = new Set<string>();
    for (const r of rows) keys.add(this.getWeekKey(r.date));
    return Array.from(keys).sort();
  }

  async getWeeksWithData(limit = 50): Promise<string[]> {
    await this.ready;
    const sql = `SELECT week FROM weeks WHERE (summary IS NOT NULL AND TRIM(summary)!='') OR lastGenAt IS NOT NULL ORDER BY week DESC LIMIT ${Math.max(1, Math.min(500, Number(limit)||50))}`;
    const res = this.db.exec(sql);
    if (!res[0]) return [];
    const rows = mapRow<{week: string}>(res[0]);
    return rows.map(r => r.week).filter(Boolean);
  }

  async getMonthsWithData(limit = 24): Promise<string[]> {
    await this.ready;
    const sql = `SELECT month FROM months WHERE (summary IS NOT NULL AND TRIM(summary)!='') OR lastGenAt IS NOT NULL ORDER BY month DESC LIMIT ${Math.max(1, Math.min(500, Number(limit)||24))}`;
    const res = this.db.exec(sql);
    if (!res[0]) return [];
    const rows = mapRow<{month: string}>(res[0]);
    return rows.map(r => r.month).filter(Boolean);
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
      const cfg = await getConfig();
      const ratio = Number.isFinite(cfg.dailyCapRatio as any) ? Math.max(0, Math.min(1, (cfg.dailyCapRatio as number))) : DEFAULT_DAILY_CAP_RATIO;
      const res = computeBaseUpdate({ prevBase, currentBase: prevBase, insertions: ins, deletions: del, aiScore: 0, localScore: 0, cfg: { dailyCapRatio: ratio } });
      const nextBase = res.nextBase;
      const trend = yesterday ? Math.round(nextBase - yesterday.baseScore) : (res.debug?.incApplied ?? 0);
      this.db.run(`INSERT INTO days(date, insertions, deletions, baseScore, trend, summary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, ins, del, nextBase, trend, null, now, now]);
      await this.persist();
      return (await this.getDay(date))!;
    } else {
      const ins = Math.max(0, existing.insertions + deltaIns);
      const del = Math.max(0, existing.deletions + deltaDel);
      const y = this.getYesterday(date);
      const yesterday = y ? await this.getDay(y) : null;
      const prevBase = Math.max(100, yesterday?.baseScore || 100);
      const cfg = await getConfig();
      const ratio = Number.isFinite(cfg.dailyCapRatio as any) ? Math.max(0, Math.min(1, (cfg.dailyCapRatio as number))) : DEFAULT_DAILY_CAP_RATIO;
      const currentBase = Math.max(prevBase, Math.max(100, existing.baseScore || 0));
      const res = computeBaseUpdate({ prevBase, currentBase, insertions: ins, deletions: del, aiScore: Math.max(0, existing.aiScore ?? 0), localScore: Math.max(0, existing.localScore ?? 0), cfg: { dailyCapRatio: ratio } });
      const nextBase = Math.max(currentBase, res.nextBase);
      const trend = yesterday ? Math.round(nextBase - yesterday.baseScore) : (res.debug?.incApplied ?? 0);
      this.db.run(`UPDATE days SET insertions=?, deletions=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`,
        [ins, del, nextBase, trend, now, date]);
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

  async setDayMetrics(date: string, metrics: { aiScore?: number | null; localScore?: number | null; localScoreRaw?: number | null; progressPercent?: number | null }, opts?: { overwriteToday?: boolean }) {
    await this.ready;
    const now = Date.now();
    const row = await this.getDay(date);
    if (!row) return; // ensure row exists before setting
    const ai = (metrics.aiScore ?? row.aiScore ?? null);
    const loc = (metrics.localScore ?? row.localScore ?? null);
    const locRaw = (metrics.localScoreRaw ?? row.localScoreRaw ?? null);
    const prog = (metrics.progressPercent ?? row.progressPercent ?? null);

    // 通过 baseScoreEngine 计算 nextBase/trend
    const yKey = this.getYesterday(date);
    const y = yKey ? await this.getDay(yKey) : null;
    const prevBase = Math.max(100, y?.baseScore || 100);
    const ins = Math.max(0, row.insertions || 0);
    const del = Math.max(0, row.deletions || 0);
    const cfg = await getConfig();
    const ratio = Number.isFinite(cfg.dailyCapRatio as any) ? Math.max(0, Math.min(1, (cfg.dailyCapRatio as number))) : DEFAULT_DAILY_CAP_RATIO;
    // overwriteToday 时，从 prevBase 开始计算，否则从当前记录的 baseScore
    const currentBase = opts?.overwriteToday ? prevBase : Math.max(prevBase, Math.max(100, row.baseScore || 0));
    const res = computeBaseUpdate({
      prevBase,
      currentBase,
      insertions: ins,
      deletions: del,
      aiScore: (typeof ai === 'number' ? ai : 0),
      localScore: (typeof loc === 'number' ? loc : 0),
      cfg: { dailyCapRatio: ratio },
    });
    if (this.logger.enabled.debug) {
      this.logger.debug('setDayMetrics cap', {
        date,
        prevBase,
        currentBase,
        ins,
        del,
        incLines: res.debug?.incLines,
        aiPart: res.debug?.aiPart,
        incLocal: res.debug?.incLocal,
        dailyInc: res.debug?.dailyInc,
        maxDailyAllowance: res.debug?.maxDailyAllowance,
        alreadyGained: res.debug?.alreadyGained,
        remainingAllowance: res.debug?.remainingAllowance,
        incApplied: res.debug?.incApplied,
        nextBase: res.nextBase,
      });
    }
    const nextBase = res.nextBase;
    const trend = y ? Math.round(nextBase - (y.baseScore || 0)) : (res.debug?.incApplied ?? 0);

    // If today's summary already exists and we're not explicitly overwriting, do NOT change base/trend here
    if (row.lastGenAt && !opts?.overwriteToday) {
      this.db.run(`UPDATE days SET aiScore=?, localScore=?, localScoreRaw=?, progressPercent=?, updatedAt=? WHERE date=?`, [ai, loc, locRaw, prog, now, date]);
      await this.persist();
      return;
    }
    this.db.run(`UPDATE days SET aiScore=?, localScore=?, localScoreRaw=?, progressPercent=?, baseScore=?, trend=?, updatedAt=? WHERE date=?`, [ai, loc, locRaw, prog, nextBase, trend, now, date]);
    await this.persist();
  }

  async setDayBaseScore(date: string, baseScore: number) {
    await this.ready;
    const now = Date.now();
    const y = this.getYesterday(date);
    const yesterday = y ? await this.getDay(y) : null;
    const prevBase = Math.max(100, yesterday?.baseScore || 100);
    const trend = Math.round(baseScore - prevBase);
    this.db.run(`UPDATE days SET baseScore=?, trend=?, updatedAt=? WHERE date=?`, [
      Math.round(baseScore), trend, now, date
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

// Helpers for per-repo DB filename derivation
function simpleHash(s: string): string {
  let h = 2166136261 >>> 0; // FNV-1a base
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function sanitizeFile(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(-64) || 'db';
}
