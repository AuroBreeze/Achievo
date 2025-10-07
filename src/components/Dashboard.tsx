import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Format large numbers: >=10,000 => W unit; >=1,000 => K unit
function formatCompact(value: number): string {
  const n = Math.abs(value);
  if (n >= 10000) {
    const v = +(value / 10000).toFixed(1);
    return `${v}${'W'}`;
  }
  if (n >= 1000) {
    const v = +(value / 1000).toFixed(1);
    return `${v}${'K'}`;
  }
  return String(value);
}

// Helper: greedily extract the first balanced JSON object from a string
function extractFirstJsonObject(text: string): string | null {
  const s = String(text);
  const i = s.indexOf('{');
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (!esc && ch === '"') inStr = false;
      esc = (!esc && ch === '\\');
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return s.slice(i, j + 1); }
  }
  return null;
}

// Small inline icons for stat cards
const StatIcon: React.FC<{ name: 'add' | 'del' | 'score' | 'trend' | 'total' | 'local' | 'ai' | 'percent' }> = ({ name }) => {
  const cls = 'w-4 h-4';
  switch (name) {
    case 'add':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
      );
    case 'del':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 7h14M9 7v12m6-12v12M10 4h4l1 3H9l1-3Z"/></svg>
      );
    case 'score':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 1 18 0"/><path d="M7 12l3 3 7-7"/></svg>
      );
    case 'trend':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 17l6-6 4 4 7-7"/></svg>
      );
    case 'total':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3h18v6H3zM3 15h18v6H3z"/></svg>
      );
    case 'local':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l9 4.5-9 4.5-9-4.5Z"/><path d="M3 12l9 4.5 9-4.5"/></svg>
      );
    case 'ai':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l2.5 2.5M16.5 16.5 19 19M5 19l2.5-2.5M16.5 7.5 19 5"/></svg>
      );
    case 'percent':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></svg>
      );
  }
};

// Skeleton value renderer
const StatValue: React.FC<{ value: React.ReactNode }> = ({ value }) => {
  if (value === null || value === undefined || value === '-') {
    return <div className="h-6 w-16 rounded bg-slate-700/60 animate-pulse" />;
  }
  const rendered = typeof value === 'number' ? formatCompact(value) : value;
  return <div className="text-2xl font-semibold">{rendered}</div>;
};

// Lazy mount helpers
const rIC = (cb: () => void) => (typeof (window as any).requestIdleCallback === 'function' ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 50));
const LazyIcon: React.FC<{ name: Parameters<typeof StatIcon>[0]['name'] }> = ({ name }) => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { const id = rIC(() => setReady(true)); return () => { if (typeof id === 'number') clearTimeout(id); }; }, []);
  if (!ready) return null;
  return <StatIcon name={name} />;
};

// Reusable stat card component
const StatCard: React.FC<{
  title: string;
  icon?: 'add' | 'del' | 'score' | 'trend' | 'total' | 'local' | 'ai' | 'percent';
  value?: React.ReactNode;
  valueClassName?: string; // for colored value like trend/percent
  subtitle?: React.ReactNode;
  titleAttr?: string;
  children?: React.ReactNode; // custom content instead of value
}> = ({ title, icon, value, valueClassName, subtitle, titleAttr, children }) => (
  <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg" title={typeof titleAttr === 'string' ? titleAttr : undefined}>
    <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2">
      {icon && <LazyIcon name={icon} />}
      {title}
    </div>
    {children ? (
      children
    ) : valueClassName ? (
      <div className={`text-2xl font-semibold ${valueClassName}`}>{value}</div>
    ) : (
      <StatValue value={value} />
    )}
    {subtitle}
  </div>
);

// Helper: replace any top-level JSON object that contains a markdown/summary/text field with that field content
function replaceJsonObjectWithMarkdown(text: string): string {
  let out = String(text);
  const objStr = extractFirstJsonObject(out);
  if (objStr) {
    try {
      const obj = JSON.parse(objStr);
      let md = obj?.markdown ?? obj?.summary ?? obj?.text;
      if (typeof md === 'string' && md.trim()) {
        // unescape common JSON escapes
        md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        out = out.replace(objStr, md);
      }
    } catch {}
  }
  return out;
}

const Dashboard: React.FC = () => {
  const [error, setError] = useState<string>('');
  const [today, setToday] = useState<{ date: string; insertions: number; deletions: number; baseScore: number; trend: number; summary?: string | null } | null>(null);
  const [todayBusy, setTodayBusy] = useState(false);
  const [todayText, setTodayText] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffText, setDiffText] = useState('');
  const [totals, setTotals] = useState<{ insertions: number; deletions: number; total: number } | null>(null);
  const [todayLive, setTodayLive] = useState<{ date: string; insertions: number; deletions: number } | null>(null);
  const [scoreLocal, setScoreLocal] = useState<number | null>(null);
  const [scoreAi, setScoreAi] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [featuresSummary, setFeaturesSummary] = useState<string>('');
  const [daily, setDaily] = useState<Array<{ date: string; baseScore: number; aiScore: number | null; localScore: number | null; progressPercent: number | null }>>([]);
  const [trendDerived, setTrendDerived] = useState<number | null>(null);
  const [lastGenAt, setLastGenAt] = useState<number | null>(null);
  const [chunksCount, setChunksCount] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiTokens, setAiTokens] = useState<number | null>(null);
  const [aiDurationMs, setAiDurationMs] = useState<number | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [pollSeconds, setPollSeconds] = useState<number>(10);
  const [currentRepo, setCurrentRepo] = useState<string>('');
  const currentRepoRef = React.useRef<string>('');
  const repoReloadTimer = React.useRef<number | null>(null);

  const loadToday = async () => {
    if (!window.api) return;
    const t = await window.api.statsGetToday();
    setToday(t);
    // initialize metrics from persisted DB values if available
    if (typeof t?.localScore === 'number') setScoreLocal(t.localScore);
    if (typeof t?.aiScore === 'number') setScoreAi(t.aiScore);
    if (typeof t?.progressPercent === 'number') setProgressPercent(t.progressPercent);
    // update AI meta from DB (do not rely on truthy checks)
    if (t) {
      setLastGenAt((t as any).lastGenAt ?? null);
      setChunksCount(typeof (t as any).chunksCount === 'number' ? (t as any).chunksCount : null);
      setAiModel((t as any).aiModel ?? null);
      setAiProvider((t as any).aiProvider ?? null);
      setAiTokens(typeof (t as any).aiTokens === 'number' ? (t as any).aiTokens : null);
      setAiDurationMs(typeof (t as any).aiDurationMs === 'number' ? (t as any).aiDurationMs : null);
    }
    // show persisted markdown immediately if no local text yet
    if (!todayText && typeof t?.summary === 'string') {
      let s = t.summary;
      // If DB stored a JSON blob previously, extract markdown
      if (/^\s*\{[\s\S]*\}\s*$/.test(s)) {
        try {
          const obj = JSON.parse(s);
          const md = obj?.markdown ?? obj?.summary ?? obj?.text;
          if (typeof md === 'string' && md.trim()) s = md;
        } catch {}
      }
      setTodayText(s);
      // derive chunks count if DB meta not present
      if (t && typeof (t as any).chunksCount !== 'number') {
        try {
          const m = (s || '').match(/###\s*分片\s+\d+/g);
          setChunksCount(m ? m.length : null);
        } catch {}
      }
    }
  };

  const loadTotals = async () => {
    if (!window.api) return;
    let t2: { insertions: number; deletions: number; total: number } | null = null;
    try {
      t2 = await window.api.statsGetTotalsLive();
    } catch {
      t2 = await window.api.statsGetTotals();
    }
    setTotals(t2);
  };

  const loadTodayLive = async () => {
    if (!window.api) return;
    try {
      const r = await window.api.statsGetTodayLive();
      setTodayLive(r);
    } catch {}
  };

  const loadTodayDiff = async () => {
    if (!window.api) return;
    setDiffBusy(true);
    setError('');
    try {
      const res = await window.api.diffToday();
      setDiffText(res.diff || '');
    } catch (e: any) {
      setError(e?.message ?? '加载今日改动详情失败');
    } finally {
      setDiffBusy(false);
    }
  };

  const loadDailyRange = React.useCallback(async () => {
    if (!window.api?.statsGetRange) return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29); // last 30 days inclusive
    const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const rows = await window.api.statsGetRange({ startDate: toKey(start), endDate: toKey(end) });
    type RowIn = { date: string; baseScore: number; aiScore?: number | null; localScore?: number | null; progressPercent?: number | null };
    const mapped = ((rows || []) as RowIn[])
      .map((r: RowIn) => ({
        date: r.date,
        baseScore: r.baseScore,
        aiScore: (r as any).aiScore ?? null,
        localScore: (r as any).localScore ?? null,
        progressPercent: (r as any).progressPercent ?? null,
      }))
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
    setDaily(mapped);
  }, []);

  React.useEffect(() => {
    // initial fetch + apply configured poll interval from config
    (async () => {
      try {
        if (window.api?.getConfig) {
          const cfg: any = await window.api.getConfig();
          const dps = typeof cfg?.dbPollSeconds === 'number' && cfg.dbPollSeconds > 0 ? cfg.dbPollSeconds : 10;
          setPollSeconds(dps);
          if (typeof cfg?.repoPath === 'string') { setCurrentRepo(cfg.repoPath); currentRepoRef.current = cfg.repoPath; }
        }
      } catch {}
      await loadTodayLive();
      await loadToday();
      await loadTotals();
      await loadDailyRange();
    })();
    // listen for config changes
    const onCfg = (e: any) => {
      const dps = typeof e?.detail?.dbPollSeconds === 'number' && e.detail.dbPollSeconds > 0 ? e.detail.dbPollSeconds : null;
      if (dps) setPollSeconds(dps);
      // If repoPath changed, force reload all series from new repo DB
      if (typeof e?.detail?.repoPath === 'string') {
        const rp = e.detail.repoPath;
        if (rp !== currentRepo) {
          setCurrentRepo(rp);
          currentRepoRef.current = rp;
          // Clear current visuals to avoid cross-repo mixing
          setToday(null);
          setTodayText('');
          setTotals(null);
          setTodayLive(null);
          setScoreLocal(null);
          setScoreAi(null);
          setProgressPercent(null);
          setFeaturesSummary('');
          setDaily([]);
          setTrendDerived(null);
          setLastGenAt(null);
          setChunksCount(null);
          setAiModel(null);
          setAiProvider(null);
          setAiTokens(null);
          setAiDurationMs(null);
          setTodayBusy(false);
          setJobProgress(0);
          // Debounced + idle-scheduled reload to avoid thrash on rapid switches
          if (repoReloadTimer.current) { clearTimeout(repoReloadTimer.current); repoReloadTimer.current = null; }
          repoReloadTimer.current = window.setTimeout(() => {
            // schedule heavy loads when browser is idle
            const doLoad = async () => {
              await loadTodayLive();
              await loadToday();
              await loadTotals();
              await loadDailyRange();
            };
            const id = (window as any).requestIdleCallback ? (window as any).requestIdleCallback(doLoad) : setTimeout(doLoad, 50);
            // best-effort cleanup of idle handle when component unmounts
            try { if (typeof id === 'number') { /* no standard cancel needed here */ } } catch {}
            repoReloadTimer.current = null;
          }, 250);
        }
      }
    };
    window.addEventListener('config:updated' as any, onCfg as any);
    return () => { window.removeEventListener('config:updated' as any, onCfg as any); };
  }, [loadDailyRange]);

  React.useEffect(() => {
    const ms = Math.max(1000, (pollSeconds || 10) * 1000);
    const id = setInterval(async () => {
      await loadTodayLive();
      await loadToday();
      await loadTotals();
      await loadDailyRange();
    }, ms);
    return () => clearInterval(id);
  }, [pollSeconds, loadDailyRange]);

  // Subscribe background job progress and restore status on mount/route return
  React.useEffect(() => {
    if (!window.api) return;
    const off = window.api.onSummaryJobProgress(async ({ status, progress }) => {
      // Guard: ensure event applies to current repo
      try {
        const cfg: any = await window.api?.getConfig?.();
        if (typeof cfg?.repoPath === 'string' && cfg.repoPath !== currentRepoRef.current) return;
      } catch {}
      setTodayBusy(status === 'running');
      setJobProgress(typeof progress === 'number' ? progress : 0);
      if (status === 'done') {
        try {
          const job: any = await window.api?.getSummaryJobStatus?.();
          // re-check repo before applying cached result
          try {
            const cfg2: any = await window.api?.getConfig?.();
            if (typeof cfg2?.repoPath === 'string' && cfg2.repoPath !== currentRepoRef.current) return;
          } catch {}
          const r = job?.result;
          if (r) {
            setTodayText(String(r.summary || ''));
            if (typeof r.scoreLocal === 'number') setScoreLocal(r.scoreLocal);
            if (typeof r.scoreAi === 'number') setScoreAi(r.scoreAi);
            if (typeof r.progressPercent === 'number') setProgressPercent(r.progressPercent);
            if (typeof r.lastGenAt === 'number') setLastGenAt(r.lastGenAt);
            if (typeof r.chunksCount === 'number') setChunksCount(r.chunksCount);
            if (typeof r.aiModel === 'string' || r.aiModel === null) setAiModel(r.aiModel ?? null);
            if (typeof r.aiProvider === 'string' || r.aiProvider === null) setAiProvider(r.aiProvider ?? null);
            if (typeof r.aiTokens === 'number') setAiTokens(r.aiTokens);
            if (typeof r.aiDurationMs === 'number') setAiDurationMs(r.aiDurationMs);
          }
        } catch {}
        // Refresh persisted values
        await loadToday();
        await loadTotals();
        await loadTodayLive();
        await loadDailyRange();
      }
    });
    (async () => {
      try {
        const job: any = await window.api?.getSummaryJobStatus?.();
        setTodayBusy(job?.status === 'running');
        setJobProgress(typeof job?.progress === 'number' ? job.progress : 0);
        if (job?.status === 'done' && job?.result) {
          const r = job.result;
          // Update UI from cached result
          setTodayText(String(r.summary || ''));
          if (typeof r.scoreLocal === 'number') setScoreLocal(r.scoreLocal);
          if (typeof r.scoreAi === 'number') setScoreAi(r.scoreAi);
          if (typeof r.progressPercent === 'number') setProgressPercent(r.progressPercent);
          if (typeof r.lastGenAt === 'number') setLastGenAt(r.lastGenAt);
          if (typeof r.chunksCount === 'number') setChunksCount(r.chunksCount);
          if (typeof r.aiModel === 'string' || r.aiModel === null) setAiModel(r.aiModel ?? null);
          if (typeof r.aiProvider === 'string' || r.aiProvider === null) setAiProvider(r.aiProvider ?? null);
          if (typeof r.aiTokens === 'number') setAiTokens(r.aiTokens);
          if (typeof r.aiDurationMs === 'number') setAiDurationMs(r.aiDurationMs);
          await loadToday();
          await loadTotals();
          await loadTodayLive();
          await loadDailyRange();
        }
      } catch {}
    })();
    return () => { try { off && off(); } catch {} };
  }, [loadDailyRange]);

  // derive trend from daily array when API trend is missing or stale
  React.useEffect(() => {
    if (!daily || daily.length < 2) { setTrendDerived(null); return; }
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2];
    if (typeof last?.baseScore === 'number' && typeof prev?.baseScore === 'number') {
      setTrendDerived(last.baseScore - prev.baseScore);
    } else {
      setTrendDerived(null);
    }
  }, [daily]);

  const generateTodaySummary = async () => {
    if (!window.api) return;
    setError('');
    setTodayBusy(true);
    setJobProgress(0);
    try {
      const res: any = await window.api.startSummaryJob();
      if (res?.ok === false && res?.error) {
        throw new Error(res.error);
      }
      // 若已在运行，进度事件会更新 todayBusy/进度；无需等待
    } catch (e: any) {
      setError(e?.message ?? '生成今日总结失败');
      setTodayBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="add" /> 今日新增</div>
          <StatValue value={(todayLive?.insertions ?? today?.insertions) ?? '-'} />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="del" /> 今日删除</div>
          <StatValue value={(todayLive?.deletions ?? today?.deletions) ?? '-'} />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="score" /> 基础分</div>
          <StatValue value={today?.baseScore ?? '-'} />
          {(() => {
            const delta = (typeof (today as any)?.trend === 'number') ? (today as any).trend : trendDerived;
            if (typeof delta === 'number') {
              const txt = `${delta >= 0 ? '+' : ''}${formatCompact(delta)}`;
              const cls = delta >= 0 ? 'text-green-400' : 'text-red-400';
              return <div className="text-xs opacity-70 mt-1">今日 <span className={cls}>{txt}</span></div>;
            }
            return <div className="text-xs opacity-70 mt-1">今日 0</div>;
          })()}
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="trend" /> 趋势(较昨日)</div>
          {(() => {
            const val = (typeof (today as any)?.trend === 'number') ? (today as any).trend : trendDerived;
            const color = (typeof val === 'number' ? (val >= 0) : ((today?.trend||0) >= 0)) ? 'text-green-400' : 'text-red-400';
            return <div className={`text-2xl font-semibold ${color}`}>{(val ?? today?.trend ?? '—')}</div>;
          })()}
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="total" /> 总改动数</div>
          <StatValue value={totals?.total ?? '-'} />
          {(() => {
            // 对齐“今日新增/今日删除”口径，使用今日实时计数显示细分
            const insToday = (todayLive?.insertions ?? today?.insertions) ?? 0;
            const delToday = (todayLive?.deletions ?? today?.deletions) ?? 0;
            const totalToday = (typeof insToday === 'number' ? insToday : 0) + (typeof delToday === 'number' ? delToday : 0);
            return (
              <div className="text-xs opacity-70 mt-1">新增 {formatCompact(totalToday)}</div>
            );
          })()}
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg" title={featuresSummary || ''}>
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="local" /> 本地进步分</div>
          <StatValue value={scoreLocal ?? '—'} />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg" title={featuresSummary || ''}>
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="ai" /> AI 进步分</div>
          <StatValue value={scoreAi ?? '—'} />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg" title={featuresSummary || ''}>
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="percent" /> 进步百分比</div>
          <div className={`text-2xl font-semibold ${((progressPercent||0) >= 0) ? 'text-green-400' : 'text-red-400'}`}>{
            (progressPercent !== null && progressPercent !== undefined) ? `${progressPercent}%` : '—'
          }</div>
        </div>
      </section>
      <div className="lg:col-span-2 h-px bg-slate-700/60" />
      {/* Per-day metrics charts */}
      <section className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">基础分（按天）</h3>
          <p className="text-xs text-slate-400 mb-2">展示最近30天基础分趋势</p>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '基础分', data: daily.map(d => d.baseScore), borderColor: '#22c55e' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true } } }}
          />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">本地进步分（按天）</h3>
          <p className="text-xs text-slate-400 mb-2">展示最近30天本地语义分趋势</p>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '本地进步分', data: daily.map(d => (d.localScore ?? null) as any), borderColor: '#3b82f6' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }}
          />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">AI 进步分（按天）</h3>
          <p className="text-xs text-slate-400 mb-2">展示最近30天 AI 评分趋势</p>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: 'AI 进步分', data: daily.map(d => (d.aiScore ?? null) as any), borderColor: '#a78bfa' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }}
          />
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">进步百分比（按天）</h3>
          <p className="text-xs text-slate-400 mb-2">相对昨日基准的日度进步百分比</p>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '进步百分比(%)', data: daily.map(d => (d.progressPercent ?? null) as any), borderColor: '#f59e0b' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true } } }}
          />
        </div>
      </section>
      <section className="lg:col-span-2 flex items-center gap-3 flex-wrap">
        <button
          onClick={generateTodaySummary}
          disabled={todayBusy}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 disabled:opacity-60"
        >{todayBusy ? `生成中…${jobProgress ? ` ${jobProgress}%` : ''}` : '生成今日总结'}</button>
        <button
          onClick={async () => { setDiffOpen(v=>!v); if (!diffText) await loadTodayDiff(); }}
          className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600"
        >{diffOpen ? '隐藏今日改动详情' : '查看今日改动详情'}</button>
        {error && <span className="text-red-400">{error}</span>}
        {/* 状态信息已移至 AI 总结卡片的长度信息行 */}
      </section>
      <section className="lg:col-span-2 bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
        <h3 className="text-sm font-semibold text-slate-100">AI 总结</h3>
        {(() => {
          const raw = (todayText || today?.summary || '').toString();
          let mdSource = raw;
          // At render time, also guard against JSON-shaped strings
          if (/^\s*\{[\s\S]*\}\s*$/.test(raw)) {
            try {
              const obj = JSON.parse(raw);
              const md = obj?.markdown ?? obj?.summary ?? obj?.text;
              if (typeof md === 'string' && md.trim()) mdSource = md;
            } catch {}
          }
          // Additionally, strip any fenced JSON blocks ```...``` that contain a markdown field
          if (mdSource.includes('```')) {
            const fenceRe = /```[a-zA-Z0-9]*\r?\n([\s\S]*?)\r?\n```/g;
            mdSource = mdSource.replace(fenceRe, (_m, inner) => {
              try {
                const obj = JSON.parse(String(inner));
                let md = obj?.markdown ?? obj?.summary ?? obj?.text;
                if (typeof md === 'string' && md.trim()) {
                  md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                  return md;
                }
              } catch {}
              return _m;
            });
            // inline fence on one line: ```json { ... } ```
            const inlineFenceRe = /```[a-zA-Z0-9]*\s*(\{[\s\S]*?\})\s*```/g;
            mdSource = mdSource.replace(inlineFenceRe, (_m, inner) => {
              try {
                const obj = JSON.parse(String(inner));
                let md = obj?.markdown ?? obj?.summary ?? obj?.text;
                if (typeof md === 'string' && md.trim()) {
                  md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                  return md;
                }
              } catch {}
              return _m;
            });
          }
          // Final fallback: if页面上仍存在裸露的 JSON 对象（含 markdown 字段），直接替换为其中的 markdown
          if (/\{[\s\S]*\}/.test(mdSource) && mdSource.includes('markdown')) {
            const replaced = replaceJsonObjectWithMarkdown(mdSource);
            if (typeof replaced === 'string') mdSource = replaced;
          }
          // Compose meta info line (length, time, chunks, model/provider, tokens, duration)
          // Fallback to today's DB fields when local state is null (e.g., after route switch)
          const tmeta: any = today || {};
          const metaParts: string[] = [];
          const metaLen = mdSource.length;
          const metaLast = lastGenAt ?? (typeof tmeta.lastGenAt === 'number' ? tmeta.lastGenAt : null);
          const metaChunks = (typeof chunksCount === 'number') ? chunksCount : (typeof tmeta.chunksCount === 'number' ? tmeta.chunksCount : null);
          const metaModel = aiModel ?? (tmeta.aiModel ?? null);
          const metaProv = aiProvider ?? (tmeta.aiProvider ?? null);
          const metaTokens = (typeof aiTokens === 'number') ? aiTokens : (typeof tmeta.aiTokens === 'number' ? tmeta.aiTokens : null);
          const metaDur = (typeof aiDurationMs === 'number') ? aiDurationMs : (typeof tmeta.aiDurationMs === 'number' ? tmeta.aiDurationMs : null);
          metaParts.push(`长度: ${metaLen}`);
          if (typeof metaChunks === 'number') metaParts.push(`分片: ${metaChunks}`);
          if (metaLast) metaParts.push(`上次: ${new Date(Number(metaLast)).toLocaleString()}`);
          if (metaModel) metaParts.push(`模型: ${metaModel}${metaProv ? ` / ${metaProv}` : ''}`);
          if (typeof metaTokens === 'number') metaParts.push(`tokens: ${metaTokens}`);
          if (typeof metaDur === 'number') metaParts.push(`用时: ${Math.max(1, Math.round(Number(metaDur)/1000))}s`);
          const metaLine = metaParts.join(' · ');
          // Lazy show meta until browser idle to avoid blocking render after route switch
          const [metaReady, setMetaReady] = React.useState(false);
          React.useEffect(() => { const id = rIC(() => setMetaReady(true)); return () => { if (typeof id === 'number') clearTimeout(id); }; }, [mdSource, metaLast, metaChunks, metaModel, metaProv, metaTokens, metaDur]);
          return (
            <div className="prose prose-invert max-w-none mt-2 text-slate-200">
              {metaReady && <div className="text-xs text-slate-400 mb-2">{metaLine}</div>}
              {mdSource.trim() ? (
                <ReactMarkdown
                  key={`md-${mdSource.length}`}
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  rehypePlugins={[
                    rehypeSlug,
                    [rehypeAutolinkHeadings, { behavior: 'wrap' }],
                    [rehypeHighlight, { ignoreMissing: true }],
                  ]}
                >
                  {mdSource}
                </ReactMarkdown>
              ) : (
                <div className="text-slate-400">暂无总结</div>
              )}
            </div>
          );
        })()}
      </section>
      {/* 历史分数图已移除 */}
      {diffOpen && (
        <section className="lg:col-span-2 bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded border border-slate-700/70 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/70">
            <div className="text-sm font-semibold text-slate-100">今日改动详情（统一 diff）</div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600"
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(diffText || '');
                  } catch {}
                }}
              >复制</button>
              <span className="text-xs text-slate-400">{diffBusy ? '加载中…' : (diffText ? '' : '无改动')}</span>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-auto font-mono text-xs">
            {diffText ? (
              <pre className="p-4">
                {diffText.split('\n').map((line, i) => {
                  let cls = 'text-slate-300';
                  if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-amber-300';
                  else if (line.startsWith('diff --git')) cls = 'text-cyan-300';
                  else if (line.startsWith('@@')) cls = 'text-purple-300';
                  else if (line.startsWith('+')) cls = 'text-green-400';
                  else if (line.startsWith('-')) cls = 'text-red-400';
                  return <div key={i} className={cls}>{line}</div>;
                })}
              </pre>
            ) : (
              <div className="p-4 text-slate-400">今日无代码改动</div>
            )}
          </div>
        </section>
      )}

    </div>
  );
}

export default Dashboard;
