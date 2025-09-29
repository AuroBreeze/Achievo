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
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <div className="font-medium">AI 提供商与模型</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm">提供商</label>
            <select value={aiProvider} onChange={e=>setAiProvider(e.target.value as any)} className="w-full bg-slate-800 rounded p-2">
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">模型</label>
            <input value={aiModel} onChange={e=>setAiModel(e.target.value)} className="w-full bg-slate-800 rounded p-2" placeholder={aiProvider==='deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'} />
          </div>
          <div>
            <label className="block text-sm">Base URL（DeepSeek/自定义）</label>
            <input value={aiBaseUrl} onChange={e=>setAiBaseUrl(e.target.value)} className="w-full bg-slate-800 rounded p-2" placeholder={aiProvider==='deepseek' ? 'https://api.deepseek.com' : 'https://your.api/base'} />
          </div>
          <div>
            <label className="block text-sm">AI API Key（优先使用）</label>
            <input value={aiApiKey} onChange={e=>setAiApiKey(e.target.value)} className="w-full bg-slate-800 rounded p-2" placeholder={aiProvider==='deepseek' ? 'sk-...' : 'sk-...'} />
          </div>
        </div>
        <p className="text-xs opacity-70">备注：若未填 AI API Key，将回退到 OpenAI API Key，再回退到环境变量 OPENAI_API_KEY。</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm">跟踪的文件夹（Git 仓库根目录）</label>
        <div className="flex gap-2">
          <input value={repoPath} onChange={e=>setRepoPath(e.target.value)} className="flex-1 bg-slate-800 rounded p-2" placeholder="d:/code/project" />
          <button onClick={selectFolder} className="px-3 py-1 rounded bg-slate-700">选择文件夹</button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={save} className="px-3 py-1 rounded bg-indigo-600">保存设置</button>
          {saved && <span className="text-green-400">{saved}</span>}
        </div>

        {/* 设置页不再展示手动分析结果 */}
      </div>
    </div>
  );
};

export default Settings;
