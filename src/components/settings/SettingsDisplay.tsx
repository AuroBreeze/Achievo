import React, { useEffect, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

const SettingsDisplay: React.FC = () => {
  const [quoteEnabled, setQuoteEnabled] = useState<boolean>(true);
  const [quoteFontSize, setQuoteFontSize] = useState<number>(11);
  const [quoteRefreshSeconds, setQuoteRefreshSeconds] = useState<number>(180);
  const [quoteLetterSpacing, setQuoteLetterSpacing] = useState<number>(0);
  const [saved, setSaved] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (!cfg) return;
      const qfs = (cfg as any).quoteFontSize; if (typeof qfs === 'number' && !Number.isNaN(qfs)) setQuoteFontSize(qfs);
      const qen = (cfg as any).quoteEnabled; if (typeof qen === 'boolean') setQuoteEnabled(qen);
      const qrs = (cfg as any).quoteRefreshSeconds; if (typeof qrs === 'number' && qrs > 0) setQuoteRefreshSeconds(qrs);
      const qls = (cfg as any).quoteLetterSpacing; if (typeof qls === 'number') setQuoteLetterSpacing(qls);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setDirty(true); }, [quoteEnabled, quoteFontSize, quoteRefreshSeconds, quoteLetterSpacing]);

  const save = async () => {
    setSaved('');
    try {
      await (window as any).api?.setConfig?.({
        quoteEnabled,
        quoteFontSize,
        quoteRefreshSeconds,
        quoteLetterSpacing,
      });
      setSaved('已保存');
      setDirty(false);
      showToast('显示设置已保存', 'success');
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { quoteEnabled, quoteFontSize, quoteRefreshSeconds, quoteLetterSpacing } })); } catch {}
    } catch {}
  };

  return (
    <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">显示</h3>
        {saved && <span className="text-green-400 text-sm">{saved}</span>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">启用一言</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={quoteEnabled} onChange={e=>setQuoteEnabled(e.target.checked)} />
            <span>{quoteEnabled ? '已启用' : '已关闭'}</span>
          </label>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">一言字体大小（px）</label>
          <input type="number" min={8} max={24} value={quoteFontSize} onChange={e=>setQuoteFontSize(parseInt(e.target.value)||11)} className="w-24 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">刷新频率（秒）</label>
          <input type="number" min={30} max={1200} value={quoteRefreshSeconds} onChange={e=>setQuoteRefreshSeconds(parseInt(e.target.value)||60)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50" disabled={!quoteEnabled} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">一言字间距（px）</label>
          <input type="number" min={-2} max={10} step={0.5} value={quoteLetterSpacing} onChange={e=>setQuoteLetterSpacing(parseFloat(e.target.value))} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50" />
        </div>
      </div>
      <div className="mt-3">
        <button onClick={save} disabled={!dirty} className={`px-4 py-2 rounded-md text-white shadow border transition-colors ${dirty ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500/60' : 'bg-slate-700 border-slate-600 opacity-70 cursor-not-allowed'}`}>保存</button>
      </div>
    </section>
  );
};

export default SettingsDisplay;
