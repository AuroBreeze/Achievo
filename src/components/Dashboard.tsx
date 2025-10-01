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

  const loadToday = async () => {
    if (!window.api) return;
    const t = await window.api.statsGetToday();
    setToday(t);
    // initialize metrics from persisted DB values if available
    if (typeof t?.localScore === 'number') setScoreLocal(t.localScore);
    if (typeof t?.aiScore === 'number') setScoreAi(t.aiScore);
    else if (typeof t?.baseScore === 'number') setScoreAi(t.baseScore); // fallback to cumulative base
    if (typeof t?.progressPercent === 'number') setProgressPercent(t.progressPercent);
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
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <div className="text-sm opacity-75">今日新增</div>
          <div className="text-2xl font-semibold">{(todayLive?.insertions ?? today?.insertions) ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <div className="text-sm opacity-75">今日删除</div>
          <div className="text-2xl font-semibold">{(todayLive?.deletions ?? today?.deletions) ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <div className="text-sm opacity-75">基础分</div>
          <div className="text-2xl font-semibold">{today?.baseScore ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <div className="text-sm opacity-75">趋势(较昨日)</div>
          <div className={`text-2xl font-semibold ${((today?.trend||0) >= 0) ? 'text-green-400' : 'text-red-400'}`}>{today?.trend ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <div className="text-sm opacity-75">总改动数</div>
          <div className="text-2xl font-semibold">{totals?.total ?? '-'}</div>
          <div className="text-xs opacity-70 mt-1">新增 {totals?.insertions ?? 0} · 删除 {totals?.deletions ?? 0}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700" title={featuresSummary || ''}>
          <div className="text-sm opacity-75">本地进步分</div>
          <div className="text-2xl font-semibold">{scoreLocal ?? '—'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700" title={featuresSummary || ''}>
          <div className="text-sm opacity-75">AI 进步分</div>
          <div className="text-2xl font-semibold">{scoreAi ?? '—'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700" title={featuresSummary || ''}>
          <div className="text-sm opacity-75">进步百分比</div>
          <div className={`text-2xl font-semibold ${((progressPercent||0) >= 0) ? 'text-green-400' : 'text-red-400'}`}>{
            (progressPercent !== null && progressPercent !== undefined) ? `${progressPercent}%` : '—'
          }</div>
        </div>
      </section>
      {/* Per-day metrics charts */}
      <section className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <h3 className="font-medium mb-2">基础分（按天）</h3>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '基础分', data: daily.map(d => d.baseScore), borderColor: '#22c55e' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true } } }}
          />
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <h3 className="font-medium mb-2">本地进步分（按天）</h3>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '本地进步分', data: daily.map(d => (d.localScore ?? null) as any), borderColor: '#3b82f6' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }}
          />
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <h3 className="font-medium mb-2">AI 进步分（按天）</h3>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: 'AI 进步分', data: daily.map(d => (d.aiScore ?? null) as any), borderColor: '#a78bfa' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }}
          />
        </div>
        <div className="bg-slate-800 rounded p-4 border border-slate-700">
          <h3 className="font-medium mb-2">进步百分比（按天）</h3>
          <Line
            data={{
              labels: daily.map(d => d.date),
              datasets: [{ label: '进步百分比(%)', data: daily.map(d => (d.progressPercent ?? null) as any), borderColor: '#f59e0b' }],
            }}
            options={{ responsive: true, scales: { y: { beginAtZero: true } } }}
          />
        </div>
      </section>
      <section className="lg:col-span-2 flex items-center gap-2">
        <button onClick={generateTodaySummary} disabled={todayBusy} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-60">{todayBusy ? '生成中…' : '生成今日总结'}</button>
        <button onClick={async () => { setDiffOpen(v=>!v); if (!diffText) await loadTodayDiff(); }} className="px-4 py-2 rounded bg-slate-700">{diffOpen ? '隐藏今日改动详情' : '查看今日改动详情'}</button>
        {error && <span className="text-red-400">{error}</span>}
      </section>
      <section className="lg:col-span-2 bg-slate-800 rounded p-4 border border-slate-700">
        <h3 className="font-medium">AI 总结</h3>
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
        <section className="lg:col-span-2 bg-slate-900 rounded border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
            <div className="font-medium">今日改动详情（统一 diff）</div>
            <div className="text-xs opacity-70">{diffBusy ? '加载中…' : (diffText ? '' : '无改动')}</div>
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
