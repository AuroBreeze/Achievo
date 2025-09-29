import React, { useState } from 'react';

const Dashboard: React.FC = () => {
  const [error, setError] = useState<string>('');
  const [today, setToday] = useState<{ date: string; insertions: number; deletions: number; baseScore: number; trend: number; summary?: string | null } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [todayBusy, setTodayBusy] = useState(false);
  const [todayText, setTodayText] = useState('');

  const loadToday = async () => {
    if (!window.api) return;
    const t = await window.api.statsGetToday();
    setToday(t);
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

  const generateSummary = async () => {
    if (!window.api) return;
    setGenBusy(true);
    setError('');
    try {
      await window.api.summaryGenerate();
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? '生成总结失败');
    } finally {
      setGenBusy(false);
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
        <button onClick={generateSummary} disabled={genBusy} className="px-4 py-2 rounded bg-emerald-600 disabled:opacity-60">{genBusy ? '生成中…' : '生成今日总结（上次总结日至今）'}</button>
        <button onClick={generateTodaySummary} disabled={todayBusy} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-60">{todayBusy ? '生成中…' : '生成今日总结（今天以来）'}</button>
        {error && <span className="text-red-400">{error}</span>}
      </section>
      <section className="lg:col-span-2 bg-slate-800 rounded p-4">
        <h3 className="font-medium">AI 总结</h3>
        <pre className="whitespace-pre-wrap mt-2 text-slate-200">{todayText || today?.summary || '—'}</pre>
      </section>
    </div>
  );
};

export default Dashboard;
