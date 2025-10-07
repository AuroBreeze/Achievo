import React, { useEffect, useState } from 'react';

const SettingsScoring: React.FC = () => {
  const [coldStartN, setColdStartN] = useState<number>(3);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [alpha, setAlpha] = useState<number>(0.65);
  const [capCold, setCapCold] = useState<number>(98);
  const [capStable, setCapStable] = useState<number>(85);
  const [winsorPLow, setWinsorPLow] = useState<number>(0.05);
  const [winsorPHigh, setWinsorPHigh] = useState<number>(0.95);
  const [normalMean, setNormalMean] = useState<number>(88);
  const [normalStd, setNormalStd] = useState<number>(14);
  const [regressionCapAfterHigh, setRegressionCapAfterHigh] = useState<number>(80);
  const [highThreshold, setHighThreshold] = useState<number>(95);
  const [saved, setSaved] = useState<string>('');

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      const ls = (cfg as any)?.localScoring || {};
      if (typeof ls.coldStartN === 'number') setColdStartN(ls.coldStartN);
      if (typeof ls.windowDays === 'number') setWindowDays(ls.windowDays);
      if (typeof ls.alpha === 'number') setAlpha(ls.alpha);
      if (typeof ls.capCold === 'number') setCapCold(ls.capCold);
      if (typeof ls.capStable === 'number') setCapStable(ls.capStable);
      if (typeof ls.winsorPLow === 'number') setWinsorPLow(ls.winsorPLow);
      if (typeof ls.winsorPHigh === 'number') setWinsorPHigh(ls.winsorPHigh);
      if (typeof ls.normalMean === 'number') setNormalMean(ls.normalMean);
      if (typeof ls.normalStd === 'number') setNormalStd(ls.normalStd);
      if (typeof ls.regressionCapAfterHigh === 'number') setRegressionCapAfterHigh(ls.regressionCapAfterHigh);
      if (typeof ls.highThreshold === 'number') setHighThreshold(ls.highThreshold);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setSaved('');
    try {
      await (window as any).api?.setConfig?.({
        localScoring: {
          coldStartN: Math.max(0, Math.floor(coldStartN || 0)),
          windowDays: Math.max(7, Math.floor(windowDays || 30)),
          alpha: Math.max(0, Math.min(1, Number(alpha) || 0.65)),
          capCold: Math.max(0, Math.min(100, Math.floor(capCold || 98))),
          capStable: Math.max(0, Math.min(100, Math.floor(capStable || 85))),
          winsorPLow: Math.max(0, Math.min(0.49, Number(winsorPLow) || 0.05)),
          winsorPHigh: Math.max(0.51, Math.min(1, Number(winsorPHigh) || 0.95)),
          normalMean: Math.max(0, Math.min(100, Number(normalMean) || 88)),
          normalStd: Math.max(1, Math.min(50, Number(normalStd) || 14)),
          regressionCapAfterHigh: Math.max(0, Math.min(100, Math.floor(regressionCapAfterHigh || 80))),
          highThreshold: Math.max(0, Math.min(100, Math.floor(highThreshold || 95))),
        }
      });
      setSaved('已保存');
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: {
        localScoring: {
          coldStartN: Math.max(0, Math.floor(coldStartN || 0)),
          windowDays: Math.max(7, Math.floor(windowDays || 30)),
          alpha: Math.max(0, Math.min(1, Number(alpha) || 0.65)),
          capCold: Math.max(0, Math.min(100, Math.floor(capCold || 98))),
          capStable: Math.max(0, Math.min(100, Math.floor(capStable || 85))),
          winsorPLow: Math.max(0, Math.min(0.49, Number(winsorPLow) || 0.05)),
          winsorPHigh: Math.max(0.51, Math.min(1, Number(winsorPHigh) || 0.95)),
          normalMean: Math.max(0, Math.min(100, Number(normalMean) || 88)),
          normalStd: Math.max(1, Math.min(50, Number(normalStd) || 14)),
          regressionCapAfterHigh: Math.max(0, Math.min(100, Math.floor(regressionCapAfterHigh || 80))),
          highThreshold: Math.max(0, Math.min(100, Math.floor(highThreshold || 95))),
        }
      } })); } catch {}
    } catch {}
  };

  return (
    <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">学习曲线（本地进步分）</h3>
        {saved && <span className="text-green-400 text-sm">{saved}</span>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">冷启动天数 N</label>
          <input type="number" min={0} max={10} value={coldStartN} onChange={e=>setColdStartN(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">窗口天数 K</label>
          <input type="number" min={7} max={120} value={windowDays} onChange={e=>setWindowDays(parseInt(e.target.value)||30)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">平滑系数 α (0..1)</label>
          <input type="number" step={0.05} min={0} max={1} value={alpha} onChange={e=>setAlpha(parseFloat(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">冷启动封顶 capCold</label>
          <input type="number" min={0} max={100} value={capCold} onChange={e=>setCapCold(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">稳态封顶 capStable</label>
          <input type="number" min={0} max={100} value={capStable} onChange={e=>setCapStable(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Winsor pLow</label>
          <input type="number" step={0.01} min={0} max={0.49} value={winsorPLow} onChange={e=>setWinsorPLow(parseFloat(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Winsor pHigh</label>
          <input type="number" step={0.01} min={0.51} max={1} value={winsorPHigh} onChange={e=>setWinsorPHigh(parseFloat(e.target.value)||1)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">正态均值（冷启动）</label>
          <input type="number" min={0} max={100} value={normalMean} onChange={e=>setNormalMean(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">正态标准差（冷启动）</label>
          <input type="number" min={1} max={50} value={normalStd} onChange={e=>setNormalStd(parseInt(e.target.value)||1)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">昨日高分回归封顶</label>
          <input type="number" min={0} max={100} value={regressionCapAfterHigh} onChange={e=>setRegressionCapAfterHigh(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">昨日高分阈值</label>
          <input type="number" min={0} max={100} value={highThreshold} onChange={e=>setHighThreshold(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
        </div>
      </div>
      <div className="text-xs text-slate-400 mt-3 space-y-1">
        <p><b>说明</b>：稳态使用 ECDF 分位；冷启动用正态 CDF 回退；最终分采用平滑，并在昨日日分≥阈值时限制回归封顶。</p>
      </div>
      <div className="mt-3">
        <button onClick={save} className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow border border-indigo-500/60 transition-colors">保存</button>
      </div>
    </section>
  );
};

export default SettingsScoring;
