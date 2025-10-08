import React, { useEffect, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

const SettingsAI: React.FC = () => {
  const [aiProvider, setAiProvider] = useState<'openai'|'deepseek'|'custom'>('openai');
  const [aiModel, setAiModel] = useState<string>('gpt-4o-mini');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [saved, setSaved] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (!cfg) return;
      setAiProvider((cfg.aiProvider as any) ?? 'openai');
      setAiModel(cfg.aiModel ?? (cfg.aiProvider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'));
      setAiBaseUrl(cfg.aiBaseUrl ?? '');
      setAiApiKey(cfg.aiApiKey ?? '');
      setOpenaiApiKey(cfg.openaiApiKey ?? '');
      setOfflineMode(!!cfg.offlineMode);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setDirty(true); }, [aiProvider, aiModel, aiBaseUrl, aiApiKey, openaiApiKey, offlineMode]);

  const save = async () => {
    setSaved('');
    try {
      await (window as any).api?.setConfig?.({
        aiProvider,
        aiModel,
        aiBaseUrl,
        aiApiKey,
        openaiApiKey,
        offlineMode,
      });
      setSaved('已保存');
      setDirty(false);
      showToast('AI 设置已保存', 'success');
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { aiProvider, aiModel, offlineMode } })); } catch {}
    } catch {}
  };

  return (
    <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">AI 设置</h3>
          {offlineMode && (
            <span className="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40" title="离线模式启用中：不会调用外部 AI 服务">离线模式</span>
          )}
        </div>
        {saved && <span className="text-green-400 text-sm">{saved}</span>}
      </header>
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${offlineMode ? 'opacity-90' : ''}`}>
        <div>
          <label className="block text-xs text-slate-400 mb-1">提供商</label>
          <select
            value={aiProvider}
            onChange={e=>setAiProvider(e.target.value as any)}
            disabled={offlineMode}
            title={offlineMode ? '离线模式启用中：AI 设置不可编辑' : ''}
            className={`w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50 ${offlineMode ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">模型</label>
          <input
            value={aiModel}
            onChange={e=>setAiModel(e.target.value)}
            disabled={offlineMode}
            title={offlineMode ? '离线模式启用中：AI 设置不可编辑' : ''}
            className={`w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50 ${offlineMode ? 'cursor-not-allowed opacity-60' : ''}`}
            placeholder={aiProvider==='deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Base URL（DeepSeek/自定义）</label>
          <input
            value={aiBaseUrl}
            onChange={e=>setAiBaseUrl(e.target.value)}
            disabled={offlineMode}
            title={offlineMode ? '离线模式启用中：AI 设置不可编辑' : ''}
            className={`w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50 ${offlineMode ? 'cursor-not-allowed opacity-60' : ''}`}
            placeholder={aiProvider==='deepseek' ? 'https://api.deepseek.com' : 'https://your.api/base'}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">AI API Key（优先使用）</label>
          <input
            value={aiApiKey}
            onChange={e=>setAiApiKey(e.target.value)}
            disabled={offlineMode}
            title={offlineMode ? '离线模式启用中：AI 设置不可编辑' : ''}
            className={`w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50 ${offlineMode ? 'cursor-not-allowed opacity-60' : ''}`}
            placeholder={aiProvider==='deepseek' ? 'sk-...' : 'sk-...'}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">OpenAI API Key（回退使用）</label>
          <input
            value={openaiApiKey}
            onChange={e=>setOpenaiApiKey(e.target.value)}
            disabled={offlineMode}
            title={offlineMode ? '离线模式启用中：AI 设置不可编辑' : ''}
            className={`w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50 ${offlineMode ? 'cursor-not-allowed opacity-60' : ''}`}
            placeholder="sk-..."
          />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-xs text-slate-300 mb-1">
            <input type="checkbox" checked={offlineMode} onChange={e=>setOfflineMode(e.target.checked)} />
            启用离线模式（不调用外部 AI 服务）
          </label>
          <p className="text-xs text-slate-500">开启后，“生成今日总结”将使用本地摘要（基于改动统计与特征），可随时关闭以恢复 AI 总结。</p>
        </div>
      </div>
      <div className="mt-3">
        <button onClick={save} disabled={!dirty} className={`px-4 py-2 rounded-md text-white shadow border transition-colors ${dirty ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500/60' : 'bg-slate-700 border-slate-600 opacity-70 cursor-not-allowed'}`}>保存</button>
      </div>
    </section>
  );
};

export default SettingsAI;
