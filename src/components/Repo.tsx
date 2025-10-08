import React, { useEffect, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

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
  // 轮询间隔（秒）
  const [intervalSec, setIntervalSec] = useState<number>(30);
  const baseName = (p: string) => {
    if (!p) return '';
    const s = String(p).replace(/[\\/]+$/, '');
    const arr = s.split(/\\|\//g);
    return arr[arr.length - 1] || s;
  };

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
      const ms = Math.max(5, Number(intervalSec) || 5) * 1000;
      await (window as any).api?.trackingStart?.({ repoPath, intervalMs: ms });
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
      {/* Header */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded bg-indigo-600/90 text-white flex items-center justify-center shadow">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h12v16H4z"/><path d="M8 8h4M8 12h6M8 16h6"/></svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate">{baseName(repoPath) || '未选择仓库'}</div>
              <div className="text-xs text-slate-400 truncate">{repoPath || '请选择一个 Git 仓库根目录'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-1 rounded-full border ${status?.running ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-700/50 border-slate-600 text-slate-300'}`}>{status?.running ? '跟踪中' : '未跟踪'}</span>
          </div>
        </div>
        {/* path input row */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <input
            value={repoPath}
            onChange={e=>setRepoPath(e.target.value)}
            className="md:col-span-2 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="d:/code/project"
          />
          <div className="flex gap-2">
          <button onClick={selectFolder} className="flex-1 px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors flex items-center gap-1 justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h6l2 2h10v10H3z"/></svg>
            选择
          </button>
          <button onClick={async()=>{ try { await (window as any).api?.setConfig?.({ repoPath }); try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath } })); } catch {} } catch{}; refresh(); }} className="flex-1 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors">保存</button>
          </div>
        </div>
        {repoPath && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={()=>{ try { navigator.clipboard?.writeText(repoPath); showToast('已复制仓库路径','success'); } catch{} }} className="text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">复制路径</button>
            <button onClick={async()=>{ try { await (window as any).api?.openDbDir?.(); } catch{} }} className="text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">打开数据库目录</button>
            <button onClick={async()=>{ try { const r = await (window as any).api?.dbExport?.(); if (r?.ok) { showToast(`已导出到：${r.path}`,'success'); } else if(!r?.canceled) { showToast(`导出失败：${r?.error||'未知错误'}`,'error',3200); } } catch(e:any){ showToast(`导出失败：${e?.message||String(e)}`,'error',3200); } }} className="text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">导出数据库</button>
            <button onClick={async()=>{ try { (window as any).api?.onDbImportedOnce?.(()=>{ showToast('导入完成','success'); try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { forceReload: true } })); } catch {} }); const r = await (window as any).api?.dbImport?.(); if (!r?.ok && !r?.canceled) { showToast(`导入失败：${r?.error||'未知错误'}`,'error',3200); } } catch(e:any){ showToast(`导入失败：${e?.message||String(e)}`,'error',3200);} }} className="text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">导入数据库</button>
          </div>
        )}
        {status?.lastError && (
          <div className="mt-2 text-xs text-rose-400">最近错误：{status.lastError}</div>
        )}
        {!repoPath && (
          <div className="mt-3 text-xs text-amber-300">提示：选择仓库后，可开启跟踪以自动采集改动并驱动仪表盘实时更新。</div>
        )}
      </section>

      {/* Quick actions + small cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
          <header className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">快速操作</h3>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>轮询(秒)</span>
              <input type="number" min={5} step={1} value={intervalSec} onChange={e=>setIntervalSec(Math.max(1, parseInt(e.target.value)||10))} className="w-20 bg-slate-900/60 border border-slate-700 rounded-md p-1.5 outline-none text-slate-200" />
            </div>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <button disabled={busy || !repoPath} onClick={startTracking} className="px-3 py-2 rounded-md bg-emerald-600/90 hover:bg-emerald-600 text-white border border-emerald-500/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              开始跟踪
            </button>
            <button disabled={busy} onClick={stopTracking} className="px-3 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6h12v12H6z"/></svg>
              停止
            </button>
            <button disabled={busy || !repoPath} onClick={analyzeOnce} className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16v4H4zM4 12h10v8H4z"/></svg>
              立即分析
            </button>
            <button disabled={busy} onClick={runSummary} className="px-3 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-white border border-fuchsia-500/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h10M4 18h8"/></svg>
              生成今日总结
            </button>
            <button
              disabled={busy || !repoPath}
              onClick={async()=>{
                setBusy(true);
                try {
                  const res = await (window as any).api?.repoAutoSaveToday?.();
                  if (res?.ok) {
                    showToast('已自动保存今日数据','success');
                    try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { forceReload: true } })); } catch {}
                  } else if (res && res.ok === false) {
                    showToast(`自动保存失败：${res?.error||'未知错误'}`,'error', 3200);
                  }
                } catch(e:any) {
                  showToast(`自动保存失败：${e?.message||String(e)}`,'error',3200);
                }
                setBusy(false);
              }}
              className="px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16v16H4z"/><path d="M8 4v6h8V4"/></svg>
              自动保存
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-400">状态：{status?.running ? '运行中' : '已停止'}</div>
        </div>
        <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg flex flex-col gap-2">
          <div className="text-sm font-semibold text-slate-100">数据库</div>
          <div className="text-xs text-slate-400">按仓库存储，切换仓库后数据与图表自动隔离</div>
          <div className="mt-1 text-xs text-emerald-400 break-all">{dbFile ? `当前文件：${dbFile}` : '未生成数据库文件'}</div>
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
                  className="flex-1 text-left text-xs px-2 py-2 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200 transition-colors truncate inline-flex items-center gap-2"
                  title={p}
                >
                  <svg className="w-3.5 h-3.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h6l2 2h10v10H3z"/></svg>
                  <span className="truncate">{p}</span>
                </button>
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
