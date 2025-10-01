import React, { useEffect, useState } from 'react';

type TrackingStatus = {
  running: boolean;
  repoPath?: string;
  intervalMs?: number;
  lastProcessedCommit?: string | null;
  lastError?: string | null;
};

const Settings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'openai'|'deepseek'|'custom'>('openai');
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [intervalMs, setIntervalMs] = useState<number>(30000);
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<TrackingStatus>({ running: false });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!window.api) return;
    const cfg = await window.api.getConfig();
    setApiKey(cfg.openaiApiKey ?? '');
    setRepoPath(cfg.repoPath ?? '');
    setAiProvider((cfg.aiProvider as any) ?? 'openai');
    setAiModel(cfg.aiModel ?? (cfg.aiProvider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'));
    setAiBaseUrl(cfg.aiBaseUrl ?? '');
    setAiApiKey(cfg.aiApiKey ?? '');
    const st = await window.api.trackingStatus();
    setStatus(st);
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    if (!window.api) return;
    setSaved('');
    await window.api.setConfig({
      openaiApiKey: apiKey,
      repoPath,
      aiProvider,
      aiModel,
      aiBaseUrl,
      aiApiKey,
    });
    setSaved('已保存');
    await refresh();
  };

  const selectFolder = async () => {
    if (!window.api) return;
    const res = await window.api.selectFolder();
    if (!res.canceled && res.path) {
      setRepoPath(res.path);
      await window.api.setConfig({ openaiApiKey: apiKey, repoPath: res.path });
      await refresh();
    }
  };

  // 设置页面仅用于配置与保存

  return (
    <div className="max-w-3xl space-y-6">
      {/* Card: AI 提供商与模型 */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">AI 提供商与模型</h3>
          <span className="text-xs text-slate-400">用于生成总结与评分</span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">提供商</label>
            <select
              value={aiProvider}
              onChange={e=>setAiProvider(e.target.value as any)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
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
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder={aiProvider==='deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Base URL（DeepSeek/自定义）</label>
            <input
              value={aiBaseUrl}
              onChange={e=>setAiBaseUrl(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder={aiProvider==='deepseek' ? 'https://api.deepseek.com' : 'https://your.api/base'}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">AI API Key（优先使用）</label>
            <input
              value={aiApiKey}
              onChange={e=>setAiApiKey(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder={aiProvider==='deepseek' ? 'sk-...' : 'sk-...'}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">备注：若未填 AI API Key，将回退到 OpenAI API Key，再回退到环境变量 OPENAI_API_KEY。</p>
      </section>

      {/* Card: 仓库路径与跟踪 */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">跟踪的仓库</h3>
          <span className="text-xs text-slate-400">Git 仓库根目录</span>
        </header>
        <div className="flex gap-2">
          <input
            value={repoPath}
            onChange={e=>setRepoPath(e.target.value)}
            className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="d:/code/project"
          />
          <button
            onClick={selectFolder}
            className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
          >选择文件夹</button>
        </div>
      </section>

      {/* Card: 操作 */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow border border-indigo-500/60 transition-colors"
          >保存设置</button>
          {saved && <span className="text-green-400 text-sm">{saved}</span>}
        </div>
      </section>
    </div>
  );
};

export default Settings;
