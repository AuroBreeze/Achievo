import React, { useEffect, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

const SettingsDatabase: React.FC = () => {
  const [dbPollSeconds, setDbPollSeconds] = useState<number>(10);
  const [dailyCapRatioPct, setDailyCapRatioPct] = useState<number>(35);
  const [dbDir, setDbDir] = useState<string>('');
  const [saved, setSaved] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (!cfg) return;
      const dps = (cfg as any).dbPollSeconds; if (typeof dps === 'number' && dps > 0) setDbPollSeconds(dps);
      const dcr = (cfg as any).dailyCapRatio; if (typeof dcr === 'number' && dcr >= 0) setDailyCapRatioPct(Math.round(dcr * 100));
    } catch {}
    try {
      const p = await (window as any).api?.paths?.();
      if (p && typeof p === 'object') setDbDir(p.dbDir || '');
    } catch {}
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setDirty(true); }, [dbPollSeconds, dailyCapRatioPct]);

  const onExport = async () => {
    try {
      const res = await (window as any).api?.dbExport?.();
      if (res?.ok) {
        showToast(`已导出到：${res.path}`, 'success');
      } else if (!res?.canceled) {
        showToast(`导出失败：${res?.error || '未知错误'}`, 'error', 3200);
      }
    } catch (e:any) {
      showToast(`导出失败：${e?.message || String(e)}`, 'error', 3200);
    }
  };

  const onImport = async () => {
    try {
      (window as any).api?.onDbImportedOnce?.(() => {
        refresh();
        showToast('导入完成，已刷新设置', 'success');
        try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { forceReload: true } })); } catch {}
      });
      const res = await (window as any).api?.dbImport?.();
      if (!res?.ok && !res?.canceled) {
        showToast(`导入失败：${res?.error || '未知错误'}`, 'error', 3200);
      }
    } catch (e:any) {
      showToast(`导入失败：${e?.message || String(e)}`, 'error', 3200);
    }
  };

  const save = async () => {
    setSaved('');
    try {
      await (window as any).api?.setConfig?.({
        dbPollSeconds,
        dailyCapRatio: Math.max(0, Math.min(1, (dailyCapRatioPct || 0) / 100)),
      });
      setSaved('已保存');
      setDirty(false);
      showToast('数据库设置已保存', 'success');
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { dbPollSeconds, dailyCapRatio: Math.max(0, Math.min(1, (dailyCapRatioPct || 0) / 100)) } })); } catch {}
    } catch {}
  };

  return (
    <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">数据库与刷新</h3>
        {saved && <span className="text-green-400 text-sm">{saved}</span>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">仪表盘刷新间隔（秒）</label>
          <input
            type="number" min={5} max={600}
            value={dbPollSeconds}
            onChange={e=>setDbPollSeconds(Math.max(5, Math.min(600, parseInt(e.target.value)||10)))}
            className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <p className="text-xs text-slate-500 mt-1">仅影响仪表盘数据的定时刷新频率，不影响“仓库”页的跟踪抓取频率。</p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">基础分单日增幅上限（%）</label>
          <input
            type="number" min={0} max={100}
            value={dailyCapRatioPct}
            onChange={e=>setDailyCapRatioPct(Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
            className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">数据库目录</label>
          <div className="flex items-center gap-2">
            <button onClick={async()=>{ try { const p = await (window as any).api?.paths?.(); setDbDir(p?.dbDir||''); } catch{} }} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">刷新路径</button>
            <button onClick={async()=>{ try { await (window as any).api?.openDbDir?.(); } catch{} }} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">打开目录</button>
          </div>
          {dbDir && <p className="text-xs text-slate-400 break-all mt-1">{dbDir}</p>}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={!dirty} className={`px-4 py-2 rounded-md text-white shadow border transition-colors ${dirty ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500/60' : 'bg-slate-700 border-slate-600 opacity-70 cursor-not-allowed'}`}>保存</button>
          <button onClick={onExport} className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">导出数据库</button>
          <button onClick={onImport} className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">导入数据库</button>
        </div>
      </div>
    </section>
  );
};

export default SettingsDatabase;
