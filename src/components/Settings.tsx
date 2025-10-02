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
  const [quoteFontSize, setQuoteFontSize] = useState<number>(11);
  const [quoteEnabled, setQuoteEnabled] = useState<boolean>(true);
  const [quoteRefreshSeconds, setQuoteRefreshSeconds] = useState<number>(180);
  const [quoteLetterSpacing, setQuoteLetterSpacing] = useState<number>(0);
  const [dbPollSeconds, setDbPollSeconds] = useState<number>(10);
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
    const qfs = (cfg as any).quoteFontSize;
    if (typeof qfs === 'number' && !Number.isNaN(qfs)) {
      setQuoteFontSize(qfs);
    }
    const qen = (cfg as any).quoteEnabled;
    if (typeof qen === 'boolean') setQuoteEnabled(qen);
    const qrs = (cfg as any).quoteRefreshSeconds;
    if (typeof qrs === 'number' && qrs > 0) setQuoteRefreshSeconds(qrs);
    const qls = (cfg as any).quoteLetterSpacing;
    if (typeof qls === 'number') setQuoteLetterSpacing(qls);
    const dps = (cfg as any).dbPollSeconds;
    if (typeof dps === 'number' && dps > 0) setDbPollSeconds(dps);
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
      // cast to any to support newer fields in preload bridge
      quoteFontSize,
      quoteEnabled,
      quoteRefreshSeconds,
      quoteLetterSpacing,
      dbPollSeconds,
    } as any);
    setSaved('已保存');
    // notify other parts to apply immediately
    try {
      window.dispatchEvent(new CustomEvent('config:updated', { detail: { quoteFontSize, quoteEnabled, quoteRefreshSeconds, quoteLetterSpacing, dbPollSeconds } }));
    } catch {}
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
      {/* Card: 显示设置 */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">显示设置</h3>
          <span className="text-xs text-slate-400">一言（折叠侧边栏）</span>
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
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={9}
                max={16}
                value={quoteFontSize}
                onChange={e=>setQuoteFontSize(parseInt(e.target.value)||11)}
                className="hidden"
              />
              <input
                type="number"
                min={8}
                max={24}
                value={quoteFontSize}
                onChange={e=>setQuoteFontSize(parseInt(e.target.value)||11)}
                className="w-20 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <span className="text-xs text-slate-400">px</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">用于折叠侧边栏导轨的一言竖排文字大小。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">刷新频率（秒）</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={600}
                value={quoteRefreshSeconds}
                onChange={e=>setQuoteRefreshSeconds(parseInt(e.target.value)||60)}
                className="hidden"
                disabled={!quoteEnabled}
              />
              <input
                type="number"
                min={30}
                max={1200}
                value={quoteRefreshSeconds}
                onChange={e=>setQuoteRefreshSeconds(parseInt(e.target.value)||60)}
                className="w-20 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
                disabled={!quoteEnabled}
              />
              <span className="text-xs text-slate-400">秒</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">仅在侧边栏折叠时生效；过低的频率可能触发速率限制。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">一言字间距（px）</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-1}
                max={6}
                step={0.5}
                value={quoteLetterSpacing}
                onChange={e=>setQuoteLetterSpacing(parseFloat(e.target.value))}
                className="hidden"
              />
              <input
                type="number"
                min={-2}
                max={10}
                step={0.5}
                value={quoteLetterSpacing}
                onChange={e=>setQuoteLetterSpacing(parseFloat(e.target.value))}
                className="w-20 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <span className="text-xs text-slate-400">px</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">竖排时每个字之间的额外间距，支持负值。</p>
          </div>
        </div>
      </section>
      {/* Card: 数据库/数据刷新 */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">数据库</h3>
          <span className="text-xs text-slate-400">仪表盘数据刷新</span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">数据库轮询间隔（秒）</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={600}
                value={dbPollSeconds}
                onChange={e=>setDbPollSeconds(Math.max(5, Math.min(600, parseInt(e.target.value)||10)))}
                className="w-24 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <span className="text-xs text-slate-400">秒</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">用于仪表盘定时刷新今日/总计/区间数据的间隔。</p>
          </div>
        </div>
      </section>
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
