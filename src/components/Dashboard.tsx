import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Dashboard: React.FC = () => {
  const [error, setError] = useState<string>('');
  const [today, setToday] = useState<{ date: string; insertions: number; deletions: number; baseScore: number; trend: number; summary?: string | null } | null>(null);
  const [todayBusy, setTodayBusy] = useState(false);
  const [todayText, setTodayText] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffText, setDiffText] = useState('');

  const loadToday = async () => {
    if (!window.api) return;
    const t = await window.api.statsGetToday();
    setToday(t);
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
    const id = setInterval(loadToday, 10000);
    return () => clearInterval(id);
  }, []);

  const generateTodaySummary = async () => {
    if (!window.api) return;
    setTodayBusy(true);
    setError('');
    try {
      await window.api.trackingAnalyzeOnce({});
      const res = await window.api.summaryTodayDiff();
      setTodayText(res.summary || '（无内容）');
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? '生成今日总结失败');
    } finally {
      setTodayBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="lg:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded p-4">
          <div className="text-sm opacity-75">今日新增</div>
          <div className="text-2xl font-semibold">{today?.insertions ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4">
          <div className="text-sm opacity-75">今日删除</div>
          <div className="text-2xl font-semibold">{today?.deletions ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4">
          <div className="text-sm opacity-75">基础分</div>
          <div className="text-2xl font-semibold">{today?.baseScore ?? '-'}</div>
        </div>
        <div className="bg-slate-800 rounded p-4">
          <div className="text-sm opacity-75">趋势(较昨日)</div>
          <div className={`text-2xl font-semibold ${((today?.trend||0) >= 0) ? 'text-green-400' : 'text-red-400'}`}>{today?.trend ?? '-'}</div>
        </div>
      </section>
      <section className="lg:col-span-2 flex items-center gap-2">
        <button onClick={generateTodaySummary} disabled={todayBusy} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-60">{todayBusy ? '生成中…' : '生成今日总结'}</button>
        <button onClick={async () => { setDiffOpen(v=>!v); if (!diffText) await loadTodayDiff(); }} className="px-4 py-2 rounded bg-slate-700">{diffOpen ? '隐藏今日改动详情' : '查看今日改动详情'}</button>
        {error && <span className="text-red-400">{error}</span>}
      </section>
      <section className="lg:col-span-2 bg-slate-800 rounded p-4">
        <h3 className="font-medium">AI 总结</h3>
        <div className="prose prose-invert max-w-none mt-2 text-slate-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {todayText || today?.summary || '—'}
          </ReactMarkdown>
        </div>
      </section>
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
};

export default Dashboard;
