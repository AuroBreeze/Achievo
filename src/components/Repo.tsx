import React, { useEffect, useMemo, useState } from 'react';

type TrackerStatus = {
  running: boolean;
  repoPath?: string;
  intervalMs?: number;
  lastProcessedCommit?: string | null;
  lastError?: string | null;
};

const Repo: React.FC = () => {
  const [repoPath, setRepoPath] = useState('');
  const [repoHistory, setRepoHistory] = useState<string[]>([]);
  const [dbFile, setDbFile] = useState('');
  const [status, setStatus] = useState<TrackerStatus>({ running: false });
  const [busy, setBusy] = useState(false);
  const [intervalMs, setIntervalMs] = useState<number>(30000);

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (cfg) {
        setRepoPath(cfg.repoPath || '');
        setRepoHistory(Array.isArray(cfg.repoHistory) ? cfg.repoHistory : []);
      }
    } catch {}
    try {
      if ((window as any).api?.dbCurrentFile) {
        const f = await (window as any).api.dbCurrentFile();
        setDbFile(f || '');
      }
    } catch {}
    try {
      const st = await (window as any).api?.trackingStatus?.();
      if (st) setStatus(st);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const selectFolder = async () => {
    if (!(window as any).api?.selectFolder) return;
    const res = await (window as any).api.selectFolder();
    if (!res.canceled && res.path) {
      try {
        await (window as any).api.setConfig({ repoPath: res.path });
        try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath: res.path } })); } catch {}
      } catch {}
      await refresh();
    }
  };

  const chooseHistory = async (p: string) => {
    try {
      await (window as any).api?.setConfig?.({ repoPath: p });
      await (window as any).api?.repoHistoryTop?.(p);
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath: p } })); } catch {}
    } catch {}
    await refresh();
  };

  const removeHistory = async (p: string) => {
    try {
      const next = await (window as any).api?.repoHistoryRemove?.(p);
      if (Array.isArray(next)) setRepoHistory(next);
    } catch {}
  };

  const clearHistory = async () => {
    try {
      const next = await (window as any).api?.repoHistoryClear?.();
      if (Array.isArray(next)) setRepoHistory(next);
    } catch {}
  };

  const startTracking = async () => {
    setBusy(true);
    try {
      await (window as any).api?.trackingStart?.({ repoPath, intervalMs: Math.max(2000, intervalMs) });
      const st = await (window as any).api?.trackingStatus?.();
      if (st) setStatus(st);
    } catch {}
    setBusy(false);
  };

  const stopTracking = async () => {
    setBusy(true);
    try {
      await (window as any).api?.trackingStop?.();
      const st = await (window as any).api?.trackingStatus?.();
      if (st) setStatus(st);
    } catch {}
    setBusy(false);
  };

  const analyzeOnce = async () => {
    setBusy(true);
    try { await (window as any).api?.trackingAnalyzeOnce?.({ repoPath }); } catch {}
    try {
      const st = await (window as any).api?.trackingStatus?.();
      if (st) setStatus(st);
    } catch {}
    setBusy(false);
  };

  const runSummary = async () => {
    setBusy(true);
    try { await (window as any).api?.startSummaryJob?.(); } catch {}
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">当前仓库</h3>
          <span className="text-xs text-slate-400">按仓库隔离的数据库</span>
        </header>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={repoPath}
              onChange={e=>setRepoPath(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="d:/code/project"
            />
            <button onClick={selectFolder} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">选择文件夹</button>
            <button onClick={async()=>{ try { await (window as any).api?.setConfig?.({ repoPath }); try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath } })); } catch {} } catch{}; refresh(); }} className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors">保存仓库</button>
          </div>
          {dbFile && (
            <div className="text-xs text-emerald-400 break-all">当前数据库文件：{dbFile}</div>
          )}
          {status?.lastError && (
            <div className="text-xs text-rose-400">最近错误：{status.lastError}</div>
          )}
        </div>
      </section>

      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">快速操作</h3>
          <span className="text-xs text-slate-400">跟踪与总结</span>
        </header>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">轮询(ms)</span>
            <input type="number" min={2000} step={1000} value={intervalMs} onChange={e=>setIntervalMs(parseInt(e.target.value)||2000)} className="w-24 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <button disabled={busy || !repoPath} onClick={startTracking} className="px-3 py-2 rounded-md bg-emerald-600/90 hover:bg-emerald-600 text-white border border-emerald-500/60 transition-colors disabled:opacity-50">开始跟踪</button>
          <button disabled={busy} onClick={stopTracking} className="px-3 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/60 transition-colors disabled:opacity-50">停止</button>
          <button disabled={busy || !repoPath} onClick={analyzeOnce} className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors disabled:opacity-50">立即分析</button>
          <button disabled={busy} onClick={runSummary} className="px-3 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-white border border-fuchsia-500/60 transition-colors disabled:opacity-50">生成今日总结</button>
          <span className="text-xs text-slate-400">状态：{status?.running ? '运行中' : '已停止'}</span>
        </div>
      </section>

      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">历史选择</h3>
          <button onClick={clearHistory} className="text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">清空</button>
        </header>
        {repoHistory && repoHistory.length > 0 ? (
          <div className="flex flex-col gap-2">
            {repoHistory.map((p, idx) => (
              <div key={p+idx} className="flex items-center gap-2">
                <button
                  onClick={()=>chooseHistory(p)}
                  className="flex-1 text-left text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200 transition-colors truncate"
                  title={p}
                >{p}</button>
                <button onClick={()=>removeHistory(p)} className="text-xs px-2 py-1 rounded border border-rose-600 bg-rose-700/60 hover:bg-rose-700 text-slate-50">删除</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400">暂无历史记录</div>
        )}
      </section>
    </div>
  );
};

export default Repo;
