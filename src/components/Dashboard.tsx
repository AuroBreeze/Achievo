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
  return <div className="text-2xl font-semibold">{value}</div>;
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
      {icon && <StatIcon name={icon} />}
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
  const [lastGenAt, setLastGenAt] = useState<number | null>(null);
  const [chunksCount, setChunksCount] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiTokens, setAiTokens] = useState<number | null>(null);
  const [aiDurationMs, setAiDurationMs] = useState<number | null>(null);

  const loadToday = async () => {
    if (!window.api) return;
    const t = await window.api.statsGetToday();
    setToday(t);
    // initialize metrics from persisted DB values if available
    if (typeof t?.localScore === 'number') setScoreLocal(t.localScore);
    if (typeof t?.aiScore === 'number') setScoreAi(t.aiScore);
    else if (typeof t?.baseScore === 'number') setScoreAi(t.baseScore); // fallback to cumulative base
    if (typeof t?.progressPercent === 'number') setProgressPercent(t.progressPercent);
    // update AI meta if present
    if (t) {
      if (t.lastGenAt) setLastGenAt(Number(t.lastGenAt));
      if (typeof t.chunksCount === 'number') setChunksCount(t.chunksCount);
      setAiModel((t as any).aiModel ?? null);
      setAiProvider((t as any).aiProvider ?? null);
      setAiTokens((t as any).aiTokens ?? null);
      setAiDurationMs((t as any).aiDurationMs ?? null);
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

  React.useEffect(() => {
    loadToday();
    loadTotals();
    loadTodayLive();
    // Daily charts can load in background
    (async () => {
      if (!window.api?.statsGetRange) return;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29); // load last 30 days daily metrics (inclusive)
      const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const rows = await window.api.statsGetRange({ startDate: toKey(start), endDate: toKey(end) });
      const mapped = (rows||[]).map(r => ({
        date: r.date,
        baseScore: r.baseScore,
        aiScore: (r as any).aiScore ?? null,
        localScore: (r as any).localScore ?? null,
        progressPercent: (r as any).progressPercent ?? null,
      })).sort((a,b)=> a.date.localeCompare(b.date));
      setDaily(mapped);
    })();
    const id = setInterval(() => { loadToday(); loadTotals(); loadTodayLive(); }, 10000);
    return () => clearInterval(id);
  }, []);

  const generateTodaySummary = async () => {
    if (!window.api) return;
    setTodayBusy(true);
    setError('');
    try {
      await window.api.trackingAnalyzeOnce({});
      const res = await window.api.summaryTodayDiff();
      // Be resilient to different key styles from backend or model output
      const anyRes: any = res as any;
      const md = (anyRes.summary ?? anyRes.markdown ?? '（无内容）');
      setTodayText(String(md));
      // meta 将在 loadToday() 后端持久化读取，这里仅临时显示
      setLastGenAt(Date.now());
      if (chunksCount === null) {
        try {
          const m = String(md).match(/###\s*分片\s+\d+/g);
          setChunksCount(m ? m.length : null);
        } catch {}
      }
      const sl = (typeof anyRes.scoreLocal === 'number') ? anyRes.scoreLocal :
                 (typeof anyRes.score_local === 'number') ? anyRes.score_local : undefined;
      const sa = (typeof anyRes.scoreAi === 'number') ? anyRes.scoreAi :
                 (typeof anyRes.score_ai === 'number') ? anyRes.score_ai : undefined;
      const pp = (typeof anyRes.progressPercent === 'number') ? anyRes.progressPercent :
                 (typeof anyRes.progress_percent === 'number') ? anyRes.progress_percent : undefined;
      if (typeof sl === 'number') setScoreLocal(sl);
      if (typeof sa === 'number') setScoreAi(sa);
      if (typeof pp === 'number') setProgressPercent(pp);
      if (typeof res.featuresSummary === 'string') setFeaturesSummary(res.featuresSummary);
      await loadToday();
      await loadTotals();
      await loadTodayLive();
    } catch (e: any) {
      setError(e?.message ?? '生成今日总结失败');
    } finally {
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
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="trend" /> 趋势(较昨日)</div>
          <div className={`text-2xl font-semibold ${((today?.trend||0) >= 0) ? 'text-green-400' : 'text-red-400'}`}>{today?.trend ?? '-'}</div>
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2"><StatIcon name="total" /> 总改动数</div>
          <StatValue value={totals?.total ?? '-'} />
          <div className="text-xs opacity-70 mt-1">新增 {totals?.insertions ?? 0} · 删除 {totals?.deletions ?? 0}</div>
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
        >{todayBusy ? '生成中…' : '生成今日总结'}</button>
        <button
          onClick={async () => { setDiffOpen(v=>!v); if (!diffText) await loadTodayDiff(); }}
          className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600"
        >{diffOpen ? '隐藏今日改动详情' : '查看今日改动详情'}</button>
        {error && <span className="text-red-400">{error}</span>}
        <span className="text-xs text-slate-400 ml-auto flex items-center gap-3">
          <span>{lastGenAt ? `上次生成: ${new Date(lastGenAt).toLocaleString()}` : '尚未生成'}</span>
          {typeof chunksCount === 'number' && <span>{`分片: ${chunksCount}`}</span>}
          {aiModel && <span>{`模型: ${aiModel}${aiProvider ? ` / ${aiProvider}` : ''}`}</span>}
          {typeof aiTokens === 'number' && <span>{`tokens: ${aiTokens}`}</span>}
          {typeof aiDurationMs === 'number' && <span>{`用时: ${Math.max(1, Math.round(aiDurationMs/1000))}s`}</span>}
        </span>
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
          const preview = mdSource.slice(0, 120).replace(/\s+/g, ' ').trim();
          return (
            <div className="prose prose-invert max-w-none mt-2 text-slate-200">
              <div className="text-xs text-slate-400 mb-2">{`长度: ${mdSource.length}${preview ? ` · 预览: ${preview}...` : ''}`}</div>
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
