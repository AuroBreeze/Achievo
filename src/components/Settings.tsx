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
  const [repoHistory, setRepoHistory] = useState<string[]>([]);
  const [intervalMs, setIntervalMs] = useState<number>(30000);
  const [dbCurrentFile, setDbCurrentFile] = useState<string>('');
  const [quoteFontSize, setQuoteFontSize] = useState<number>(11);
  const [quoteEnabled, setQuoteEnabled] = useState<boolean>(true);
  const [quoteRefreshSeconds, setQuoteRefreshSeconds] = useState<number>(180);
  const [quoteLetterSpacing, setQuoteLetterSpacing] = useState<number>(0);
  const [dbPollSeconds, setDbPollSeconds] = useState<number>(10);
  const [dailyCapRatioPct, setDailyCapRatioPct] = useState<number>(35);
  // Developer logging
  const [logLevel, setLogLevel] = useState<'debug'|'info'|'error'>('info');
  const [logNamespacesText, setLogNamespacesText] = useState<string>('');
  const [logToFile, setLogToFile] = useState<boolean>(false);
  const [logFileName, setLogFileName] = useState<string>('achievo.log');
  const [installRoot, setInstallRoot] = useState<string>('');
  const [logDir, setLogDir] = useState<string>('');
  const [dbDir, setDbDir] = useState<string>('');
  // Learning curve (local scoring) parameters
  const [lsColdStartN, setLsColdStartN] = useState<number>(3);
  const [lsWindowDays, setLsWindowDays] = useState<number>(30);
  const [lsAlpha, setLsAlpha] = useState<number>(0.65);
  const [lsCapCold, setLsCapCold] = useState<number>(98);
  const [lsCapStable, setLsCapStable] = useState<number>(85);
  const [lsWinsorLow, setLsWinsorLow] = useState<number>(0.05);
  const [lsWinsorHigh, setLsWinsorHigh] = useState<number>(0.95);
  const [lsNormalMean, setLsNormalMean] = useState<number>(88);
  const [lsNormalStd, setLsNormalStd] = useState<number>(14);
  const [lsRegressionCap, setLsRegressionCap] = useState<number>(80);
  const [lsHighThreshold, setLsHighThreshold] = useState<number>(95);
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<TrackingStatus>({ running: false });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!window.api) return;
    const cfg = await window.api.getConfig();
    setApiKey(cfg.openaiApiKey ?? '');
    setRepoPath(cfg.repoPath ?? '');
    setRepoHistory(Array.isArray((cfg as any).repoHistory) ? ((cfg as any).repoHistory as string[]) : []);
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
    const dcr = (cfg as any).dailyCapRatio;
    if (typeof dcr === 'number' && dcr >= 0) setDailyCapRatioPct(Math.round(dcr * 100));
    const ll = (cfg as any).logLevel;
    if (ll === 'debug' || ll === 'info' || ll === 'error') setLogLevel(ll);
    const lns = Array.isArray((cfg as any).logNamespaces) ? ((cfg as any).logNamespaces as string[]) : [];
    setLogNamespacesText(lns.join(','));
    const ltf = (cfg as any).logToFile;
    if (typeof ltf === 'boolean') setLogToFile(ltf);
    const lfn = (cfg as any).logFileName;
    if (typeof lfn === 'string' && lfn.trim()) setLogFileName(lfn);
    try {
      if ((window as any).api?.paths) {
        const p = await (window as any).api.paths();
        if (p && typeof p === 'object') {
          setInstallRoot(p.installRoot || '');
          setLogDir(p.logDir || '');
          setDbDir(p.dbDir || '');
        }
      }
    } catch {}
    // load current DB file path
    try {
      if ((window as any).api?.dbCurrentFile) {
        const f = await (window as any).api.dbCurrentFile();
        setDbCurrentFile(f || '');
      }
    } catch {}
    const ls = (cfg as any).localScoring || {};
    if (typeof ls.coldStartN === 'number') setLsColdStartN(ls.coldStartN);
    if (typeof ls.windowDays === 'number') setLsWindowDays(ls.windowDays);
    if (typeof ls.alpha === 'number') setLsAlpha(ls.alpha);
    if (typeof ls.capCold === 'number') setLsCapCold(ls.capCold);
    if (typeof ls.capStable === 'number') setLsCapStable(ls.capStable);
    if (typeof ls.winsorPLow === 'number') setLsWinsorLow(ls.winsorPLow);
    if (typeof ls.winsorPHigh === 'number') setLsWinsorHigh(ls.winsorPHigh);
    if (typeof ls.normalMean === 'number') setLsNormalMean(ls.normalMean);
    if (typeof ls.normalStd === 'number') setLsNormalStd(ls.normalStd);
    if (typeof ls.regressionCapAfterHigh === 'number') setLsRegressionCap(ls.regressionCapAfterHigh);
    if (typeof ls.highThreshold === 'number') setLsHighThreshold(ls.highThreshold);
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
      dailyCapRatio: Math.max(0, Math.min(1, (dailyCapRatioPct || 0) / 100)),
      logLevel,
      logNamespaces: logNamespacesText.split(',').map(s=>s.trim()).filter(Boolean),
      logToFile,
      logFileName: (logFileName || 'achievo.log').trim(),
      localScoring: {
        coldStartN: Math.max(0, Math.floor(lsColdStartN || 0)),
        windowDays: Math.max(7, Math.floor(lsWindowDays || 30)),
        alpha: Math.max(0, Math.min(1, Number(lsAlpha)) || 0.65),
        capCold: Math.max(0, Math.min(100, Math.floor(lsCapCold || 98))),
        capStable: Math.max(0, Math.min(100, Math.floor(lsCapStable || 85))),
        winsorPLow: Math.max(0, Math.min(0.49, Number(lsWinsorLow) || 0.05)),
        winsorPHigh: Math.max(0.51, Math.min(1, Number(lsWinsorHigh) || 0.95)),
        normalMean: Math.max(0, Math.min(100, Number(lsNormalMean) || 88)),
        normalStd: Math.max(1, Math.min(50, Number(lsNormalStd) || 14)),
        regressionCapAfterHigh: Math.max(0, Math.min(100, Math.floor(lsRegressionCap || 80))),
        highThreshold: Math.max(0, Math.min(100, Math.floor(lsHighThreshold || 95))),
      }
    } as any);
    setSaved('已保存');
    // notify other parts to apply immediately
    try {
      window.dispatchEvent(new CustomEvent('config:updated', { detail: {
        quoteFontSize, quoteEnabled, quoteRefreshSeconds, quoteLetterSpacing, dbPollSeconds,
        dailyCapRatio: Math.max(0, Math.min(1, (dailyCapRatioPct || 0) / 100)),
        logLevel,
        logNamespaces: logNamespacesText.split(',').map(s=>s.trim()).filter(Boolean),
        logToFile,
        logFileName: (logFileName || 'achievo.log').trim(),
        repoPath,
        localScoring: {
          coldStartN: Math.max(0, Math.floor(lsColdStartN || 0)),
          windowDays: Math.max(7, Math.floor(lsWindowDays || 30)),
          alpha: Math.max(0, Math.min(1, Number(lsAlpha)) || 0.65),
          capCold: Math.max(0, Math.min(100, Math.floor(lsCapCold || 98))),
          capStable: Math.max(0, Math.min(100, Math.floor(lsCapStable || 85))),
          winsorPLow: Math.max(0, Math.min(0.49, Number(lsWinsorLow) || 0.05)),
          winsorPHigh: Math.max(0.51, Math.min(1, Number(lsWinsorHigh) || 0.95)),
          normalMean: Math.max(0, Math.min(100, Number(lsNormalMean) || 88)),
          normalStd: Math.max(1, Math.min(50, Number(lsNormalStd) || 14)),
          regressionCapAfterHigh: Math.max(0, Math.min(100, Math.floor(lsRegressionCap || 80))),
          highThreshold: Math.max(0, Math.min(100, Math.floor(lsHighThreshold || 95))),
        }
      } }));
    } catch {}
    await refresh();
  };

  const selectFolder = async () => {
    if (!(window as any).api?.selectFolder) return;
    const res = await (window as any).api.selectFolder();
    if (!res.canceled && res.path) {
      setRepoPath(res.path);
      if ((window as any).api?.setConfig) {
        await (window as any).api.setConfig({ openaiApiKey: apiKey, repoPath: res.path });
      }
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath: res.path } })); } catch {}
      await refresh();
    }
  };

  const selectFromHistory = async (p: string) => {
    setRepoPath(p);
    try {
      if ((window as any).api?.setConfig) {
        await (window as any).api.setConfig({ openaiApiKey: apiKey, repoPath: p });
      }
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { repoPath: p } })); } catch {}
      await refresh();
    } catch {}
  };

  const removeFromHistory = async (p: string) => {
    try {
      if ((window as any).api?.repoHistoryRemove) {
        const next = await (window as any).api.repoHistoryRemove(p);
        if (Array.isArray(next)) setRepoHistory(next);
      }
    } catch {}
  };

  const clearHistory = async () => {
    try {
      if ((window as any).api?.repoHistoryClear) {
        const next = await (window as any).api.repoHistoryClear();
        if (Array.isArray(next)) setRepoHistory(next);
      }
    } catch {}
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
      {/* Card: 开发者选项（日志） */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">开发者选项</h3>
          <span className="text-xs text-slate-400">日志级别与命名空间</span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">日志级别</label>
            <select
              value={logLevel}
              onChange={e=>setLogLevel(e.target.value as any)}
              className="w-40 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="debug">debug（调试）</option>
              <option value="info">info（信息）</option>
              <option value="error">error（错误）</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">影响全局日志级别。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">日志命名空间（逗号分隔）</label>
            <input
              value={logNamespacesText}
              onChange={e=>setLogNamespacesText(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="db,score,ai,git"
            />
            <p className="text-xs text-slate-500 mt-1">在 info 级别下，指定的命名空间也会输出 debug 日志。</p>
          </div>
          <div className="col-span-1">
            <label className="block text-xs text-slate-400 mb-1">写入日志文件</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={logToFile} onChange={e=>setLogToFile(e.target.checked)} />
              <span>{logToFile ? '已启用' : '已关闭'}</span>
            </label>
            <p className="text-xs text-slate-500 mt-1">将日志以 JSONL 形式写入应用数据目录下的文件。</p>
          </div>
          <div className="col-span-1">
            <label className="block text-xs text-slate-400 mb-1">日志文件名</label>
            <input
              value={logFileName}
              onChange={e=>setLogFileName(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="achievo.log"
              disabled={!logToFile}
            />
            <p className="text-xs text-slate-500 mt-1">文件将保存在下方“日志目录”中（保存时会按时间戳生成新文件）。</p>
          </div>
          <div className="col-span-1 flex flex-col gap-2">
            <label className="block text-xs text-slate-400 mb-1">安装目录</label>
            <div className="flex items-center gap-2">
              <button
                onClick={async ()=>{ try { const p = await (window as any).api.installRoot(); setInstallRoot(p||''); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >刷新路径</button>
              <button
                onClick={async ()=>{ try { await (window as any).api.openInstallRoot(); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >打开目录</button>
            </div>
            {installRoot && <p className="text-xs text-slate-400 break-all mt-1">{installRoot}</p>}
          </div>
          <div className="col-span-1 flex flex-col gap-2">
            <label className="block text-xs text-slate-400 mb-1">日志目录</label>
            <div className="flex items-center gap-2">
              <button
                onClick={async ()=>{ try { const p = await (window as any).api.paths(); setLogDir(p?.logDir||''); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >刷新路径</button>
              <button
                onClick={async ()=>{ try { await (window as any).api.openLogDir(); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >打开目录</button>
            </div>
            {logDir && <p className="text-xs text-slate-400 break-all mt-1">{logDir}</p>}
            <p className="text-xs text-slate-500 mt-1">当前日志文件将保存为：YYYYMMDD-HHMMSS_{logFileName}</p>
          </div>
          <div className="col-span-1 flex flex-col gap-2">
            <label className="block text-xs text-slate-400 mb-1">数据库目录</label>
            <div className="flex items-center gap-2">
              <button
                onClick={async ()=>{ try { const p = await (window as any).api.paths(); setDbDir(p?.dbDir||''); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >刷新路径</button>
              <button
                onClick={async ()=>{ try { await (window as any).api.openDbDir(); } catch{} }}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors"
              >打开目录</button>
            </div>
            {dbDir && <p className="text-xs text-slate-400 break-all mt-1">{dbDir}</p>}
            {dbCurrentFile && (
              <p className="text-xs text-emerald-400 break-all mt-1">当前数据库文件：{dbCurrentFile}</p>
            )}
          </div>
        </div>
      </section>
      {/* Card: 学习曲线（本地进步分） */}
      <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">学习曲线（本地进步分）</h3>
          <span className="text-xs text-slate-400">ECDF 分位 + 冷启动 + 平滑</span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">冷启动天数 N</label>
            <input type="number" min={0} max={10} value={lsColdStartN} onChange={e=>setLsColdStartN(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
            <p className="text-xs text-slate-500 mt-1">前 N 天使用正态 CDF 回退，不用历史样本。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">窗口天数 K</label>
            <input type="number" min={7} max={120} value={lsWindowDays} onChange={e=>setLsWindowDays(parseInt(e.target.value)||30)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
            <p className="text-xs text-slate-500 mt-1">用于计算 ECDF 的历史原始分窗口。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">平滑系数 α (0..1)</label>
            <input type="number" step={0.05} min={0} max={1} value={lsAlpha} onChange={e=>setLsAlpha(parseFloat(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
            <p className="text-xs text-slate-500 mt-1">最终分 = α·今日 + (1-α)·昨日（归一化）。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">冷启动封顶 capCold</label>
            <input type="number" min={0} max={100} value={lsCapCold} onChange={e=>setLsCapCold(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">稳态封顶 capStable</label>
            <input type="number" min={0} max={100} value={lsCapStable} onChange={e=>setLsCapStable(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Winsor pLow</label>
            <input type="number" step={0.01} min={0} max={0.49} value={lsWinsorLow} onChange={e=>setLsWinsorLow(parseFloat(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Winsor pHigh</label>
            <input type="number" step={0.01} min={0.51} max={1} value={lsWinsorHigh} onChange={e=>setLsWinsorHigh(parseFloat(e.target.value)||1)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">正态均值（冷启动）</label>
            <input type="number" min={0} max={100} value={lsNormalMean} onChange={e=>setLsNormalMean(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">正态标准差（冷启动）</label>
            <input type="number" min={1} max={50} value={lsNormalStd} onChange={e=>setLsNormalStd(parseInt(e.target.value)||1)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">昨日高分回归封顶</label>
            <input type="number" min={0} max={100} value={lsRegressionCap} onChange={e=>setLsRegressionCap(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">昨日高分阈值</label>
            <input type="number" min={0} max={100} value={lsHighThreshold} onChange={e=>setLsHighThreshold(parseInt(e.target.value)||0)} className="w-28 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none" />
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-3 space-y-1">
          <p><b>计算要点</b>：稳态使用 ECDF 分位：score = min(capStable, round(100 * percentile(raw, windowDays, Winsor)))；冷启动用正态 CDF 回退：score = min(capCold, round(CDF((raw-μ)/σ) * 100 * 0.9))；最终分采用平滑：final = min(score, round(α*score + (1-α)*yesterday_norm))，且昨日日分≥阈值时，final ≤ 回归封顶。</p>
        </div>
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
          <div>
            <label className="block text-xs text-slate-400 mb-1">基础分单日增幅上限（%）</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={dailyCapRatioPct}
                onChange={e=>setDailyCapRatioPct(Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                className="w-24 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <span className="text-xs text-slate-400">%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">相对昨日基础分的封顶比例，建议 20% ~ 50%。</p>
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
        {repoHistory && repoHistory.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">历史选择</div>
              <button onClick={clearHistory} className="text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200">清空</button>
            </div>
            <div className="flex flex-col gap-2">
              {repoHistory.map((p, idx) => (
                <div key={p+idx} className="flex items-center gap-2">
                  <button
                    onClick={()=>selectFromHistory(p)}
                    className="flex-1 text-left text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800/60 hover:bg-slate-700 text-slate-200 transition-colors truncate"
                    title={p}
                  >{p}</button>
                  <button
                    onClick={()=>removeFromHistory(p)}
                    className="text-xs px-2 py-1 rounded border border-rose-600 bg-rose-700/60 hover:bg-rose-700 text-slate-50"
                    title="从历史中移除"
                  >删除</button>
                </div>
              ))}
            </div>
          </div>
        )}
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
