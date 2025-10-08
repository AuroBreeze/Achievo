import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/settings/SettingsIndex';
import Repo from '@/components/Repo';
import TitleBar from '@/components/TitleBar';
import ToastContainer from '@/components/ui/Toast';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'repo' | 'history' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  // collapsed quote state
  const [quote, setQuote] = useState<string>('');
  const [quoteFrom, setQuoteFrom] = useState<string>('');
  const [quoteProvider, setQuoteProvider] = useState<'yiyan' | 'hitokoto' | 'quotable' | 'local' | ''>('');
  const [quoteFontSize, setQuoteFontSize] = useState<number>(11);
  const [quoteEnabled, setQuoteEnabled] = useState<boolean>(true);
  const [quoteRefreshSeconds, setQuoteRefreshSeconds] = useState<number>(180);
  const [quoteLetterSpacing, setQuoteLetterSpacing] = useState<number>(0);
  // history view states
  const [histRepoPath, setHistRepoPath] = useState<string>('');
  const [histDbFile, setHistDbFile] = useState<string>('');
  const [histItems, setHistItems] = useState<Array<{ date: string; baseScore: number; trend?: number; aiScore?: number|null; localScore?: number|null; lastGenAt?: number|null; summary?: string|null }>>([]);
  const [histSelectedDate, setHistSelectedDate] = useState<string>('');
  const [histSelected, setHistSelected] = useState<{ date: string; summary: string; aiScore?: number|null; localScore?: number|null; progressPercent?: number|null; aiModel?: string|null; aiProvider?: string|null; lastGenAt?: number|null } | null>(null);
  // debounced hover control to make sidebar open/close smoother
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);
  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const openWithDelay = (ms = 120) => {
    if (sidebarPinned) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (openTimer.current) return;
    openTimer.current = window.setTimeout(() => { setSidebarOpen(true); openTimer.current = null; }, ms);
  };
  const closeWithDelay = (ms = 200) => {
    if (sidebarPinned) return;
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) return;
    closeTimer.current = window.setTimeout(() => { setSidebarOpen(false); closeTimer.current = null; }, ms);
  };

  useEffect(() => {
    document.title = 'Achievo';
  }, []);

  // load quote font size from persisted config once
  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.api?.getConfig?.();
        const qfs = (cfg as any)?.quoteFontSize;
        if (typeof qfs === 'number' && !Number.isNaN(qfs)) setQuoteFontSize(qfs);
        const qen = (cfg as any)?.quoteEnabled;
        if (typeof qen === 'boolean') setQuoteEnabled(qen);
        const qrs = (cfg as any)?.quoteRefreshSeconds;
        if (typeof qrs === 'number' && qrs > 0) setQuoteRefreshSeconds(qrs);
        const qls = (cfg as any)?.quoteLetterSpacing;
        if (typeof qls === 'number') setQuoteLetterSpacing(qls);
      } catch {}
    })();
  }, []);

  // respond immediately to Settings changes
  useEffect(() => {
    const handler = (e: any) => {
      const d = e?.detail || {};
      if (typeof d.quoteFontSize === 'number' && !Number.isNaN(d.quoteFontSize)) setQuoteFontSize(d.quoteFontSize);
      if (typeof d.quoteEnabled === 'boolean') setQuoteEnabled(d.quoteEnabled);
      if (typeof d.quoteRefreshSeconds === 'number' && d.quoteRefreshSeconds > 0) setQuoteRefreshSeconds(d.quoteRefreshSeconds);
      if (typeof d.quoteLetterSpacing === 'number') setQuoteLetterSpacing(d.quoteLetterSpacing);
      // if repo changes, refresh history info lazily
      if (typeof d.repoPath === 'string') {
        loadHistoryPanel();
      }
    };
    window.addEventListener('config:updated' as any, handler);
    return () => window.removeEventListener('config:updated' as any, handler);
  }, []);

  // load history sidebar/panel data
  const loadHistoryPanel = async () => {
    try {
      const cfg: any = await (window as any).api?.getConfig?.();
      setHistRepoPath(cfg?.repoPath || '');
    } catch {}
    try {
      const f = await (window as any).api?.dbCurrentFile?.();
      setHistDbFile(f || '');
    } catch {}
    // last 60 days, filter days with summary or lastGenAt
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 59);
      const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const rows: any[] = await (window as any).api?.statsGetRange?.({ startDate: toKey(start), endDate: toKey(end) });
      const items = (rows || [])
        .filter(r => (r?.summary && String(r.summary).trim()) || typeof (r as any)?.lastGenAt === 'number')
        .map(r => ({
          date: r.date,
          baseScore: r.baseScore,
          trend: (r as any).trend,
          aiScore: (r as any).aiScore ?? null,
          localScore: (r as any).localScore ?? null,
          lastGenAt: (r as any).lastGenAt ?? null,
          summary: r.summary ?? null,
        }))
        .sort((a,b) => b.date.localeCompare(a.date));
      setHistItems(items);
      if (items.length > 0 && !histSelectedDate) {
        const first = items[0]!;
        setHistSelectedDate(first.date);
        // preload first
        try {
          if ((window as any).api?.statsGetDay) {
            const d = await (window as any).api.statsGetDay({ date: first.date });
            setHistSelected({ date: first.date, summary: String(d?.summary||''), aiScore: d?.aiScore ?? null, localScore: d?.localScore ?? null, progressPercent: d?.progressPercent ?? null, aiModel: (d as any)?.aiModel ?? null, aiProvider: (d as any)?.aiProvider ?? null, lastGenAt: (d as any)?.lastGenAt ?? null });
          } else {
            setHistSelected({ date: first.date, summary: String(first.summary||'') });
          }
        } catch{}
      }
    } catch {}
  };

  // when switching to History tab, load data
  useEffect(() => { if (tab === 'history') { loadHistoryPanel(); } }, [tab]);

  // fetch a short quote with timeouts and robust fallbacks
  const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, ms = 4000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(input, { ...(init||{}), signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  const fetchQuote = async () => {
    // 1) 8845 一言 (CN)
    try {
      const r0 = await fetchWithTimeout('https://img.8845.top/yiyan/index.php');
      if (r0.ok) {
        const j = await r0.json();
        const txt = String(j?.content || '').trim();
        if (txt) {
          setQuote(txt);
          setQuoteFrom('');
          setQuoteProvider('yiyan');
          return;
        }
      }
    } catch {}
    // 2) Hitokoto (CN, HTTPS good)
    try {
      const r1 = await fetchWithTimeout('https://v1.hitokoto.cn/?encode=json');
      if (r1.ok) {
        const j = await r1.json();
        const txt = String(j?.hitokoto || '').trim();
        if (txt) {
          setQuote(txt);
          setQuoteFrom(String(j?.from || ''));
          setQuoteProvider('hitokoto');
          return;
        }
      }
    } catch {}
    // 3) Quotable (EN)
    try {
      const r2 = await fetchWithTimeout('https://api.quotable.io/random');
      if (r2.ok) {
        const j = await r2.json();
        const txt = String(j?.content || '').trim();
        if (txt) {
          setQuote(txt);
          setQuoteFrom(String(j?.author || ''));
          setQuoteProvider('quotable');
          return;
        }
      }
    } catch {}
    // 4) Local fallback to ensure UI shows content
    setQuote('愿你出走半生，归来仍是少年。');
    setQuoteFrom('');
    setQuoteProvider('local');
  };

  // when collapsed, load/refresh quote periodically; stop when expanded
  // one immediate fetch on mount to warm cache
  useEffect(() => { fetchQuote(); }, []);
  useEffect(() => {
    let timer: number | null = null;
    if (quoteEnabled && !sidebarOpen) {
      if (!quote) fetchQuote();
      const ms = Math.max(10, Number(quoteRefreshSeconds) || 60) * 1000;
      timer = window.setInterval(fetchQuote, ms);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [quoteEnabled, sidebarOpen, quoteRefreshSeconds]);

  const Icon = ({ name }: { name: 'dashboard'|'repo'|'history'|'settings' }) => {
    const common = 'w-4 h-4';
    if (name === 'dashboard') return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z"/>
      </svg>
    );
    if (name === 'repo') return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4h12v16H4z"/>
        <path d="M8 8h4M8 12h6M8 16h6"/>
      </svg>
    );
    if (name === 'history') return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 12a9 9 0 1 0 3-6.708V3M3 3v6h6"/>
        <path d="M12 7v6l4 2"/>
      </svg>
    );
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3Z"/>
        <path d="M3 12l9 4.5 9-4.5"/>
      </svg>
    );
  };

  const navItem = (key: 'dashboard'|'repo'|'history'|'settings', label: string) => {
    const active = tab === key;
    return (
      <button
        className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 border
        ${active ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'hover:bg-slate-700/60 border-transparent text-slate-200'}`}
        onClick={() => setTab(key)}
      >
        <span className={`flex items-center justify-center rounded-md ${active ? 'text-indigo-300' : 'text-slate-300'}`}>
          <Icon name={key} />
        </span>
        <span className={`overflow-hidden whitespace-nowrap transition-[opacity,transform] ${sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>{label}</span>
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <TitleBar />
      <ToastContainer />
      {/* Sidebar + Content */}
      <div className="relative flex">
        {/* Hover zone to open sidebar when collapsed */}
        <div
          className="fixed top-0 left-0 h-screen z-40"
          style={{ width: 12 }}
        />

        {/* Sidebar */}
        <aside
          className={`fixed top-0 left-0 h-screen w-64 bg-gradient-to-b from-slate-800/95 via-slate-800/80 to-slate-900/90 border-r border-slate-700/80 backdrop-blur-sm transition-transform duration-200 ease-out z-50 shadow-xl ${sidebarOpen ? 'translate-x-0 rounded-none' : '-translate-x-[12.5rem] rounded-r-xl'}`}
          onMouseEnter={() => openWithDelay(0)}
          onMouseLeave={() => closeWithDelay(180)}
          style={{ willChange: 'transform', contain: 'layout paint' }}
        >
          {sidebarOpen ? (
            <div className="h-full flex flex-col p-2">
              {/* Brand + pin */}
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                    <span className="text-xs font-bold">A</span>
                  </div>
                  <div className="text-sm font-semibold overflow-hidden whitespace-nowrap">Achievo</div>
                </div>
                <button
                  className={`p-1.5 rounded-md border transition-colors ${sidebarPinned ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:bg-slate-700/60'}`}
                  title={sidebarPinned ? '取消固定侧边栏' : '固定侧边栏'}
                  onClick={() => { clearTimers(); setSidebarPinned(v => !v); setSidebarOpen(o => !sidebarPinned ? true : o); }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {sidebarPinned
                      ? <path d="M14 3l7 7-4 4-3-3-4 4H4v-6l4-4-3-3 4-4Z" />
                      : <path d="M14 3l7 7-4 4-3-3-4 4H4v-6l4-4-3-3 4-4Z" />}
                  </svg>
                </button>
              </div>

              <div className="h-px bg-slate-700/60 mx-2 mb-2" />
              <div className="flex-1 space-y-1">
                <div className="group relative">
                  {navItem('dashboard', '仪表盘')}
                </div>
                <div className="group relative">
                  {navItem('repo', '仓库')}
                </div>
                <div className="group relative">
                  {navItem('history', '历史')}
                </div>
                <div className="group relative">
                  {navItem('settings', '设置')}
                </div>
              </div>
              <div className="text-xs text-slate-400 mt-2 px-2 overflow-hidden whitespace-nowrap">{sidebarPinned ? '已固定侧边栏' : '光标移开自动隐藏'}</div>
            </div>
          ) : (
            <div className="absolute right-0 top-0 h-full w-14 bg-gradient-to-b from-slate-800/80 to-slate-900/60 border-l border-slate-700/70 flex flex-col items-center justify-between py-3">
              <button
                aria-label="展开侧边栏"
                className="w-8 h-8 rounded-md bg-slate-700/70 hover:bg-slate-600 border border-slate-600 text-slate-200 shadow"
                onClick={() => { setSidebarOpen(true); }}
              >
                <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 6l6 6-6 6"/></svg>
              </button>
              {/* Quote inline on the rail (vertical) */}
              {quoteEnabled ? (
                <div className="flex-1 w-full px-1 flex items-center justify-center select-text" onMouseEnter={() => { if (!quote) fetchQuote(); }}>
                  <button
                    className="w-full h-full leading-4 text-slate-200/90 hover:text-slate-100"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'upright', fontSize: quoteFontSize, letterSpacing: `${quoteLetterSpacing}px` }}
                    title={quoteFrom ? `${quote}\n— ${quoteFrom}` : quote}
                    onClick={() => { try { navigator.clipboard?.writeText(quote ? `${quote}${quoteFrom ? ` — ${quoteFrom}` : ''}` : ''); } catch {} }}
                  >
                    {quote || '…'}
                  </button>
                </div>
              ) : (
                <div className="flex-1" />
              )}
              <div className="flex flex-col items-center gap-1">
                <div className="text-[10px] text-slate-500 rotate-180 writing-mode-vertical-lr" style={{ writingMode: 'vertical-rl' }}>{quoteEnabled ? (quoteProvider === 'yiyan' ? '一言' : quoteProvider === 'hitokoto' ? '一言' : quoteProvider === 'quotable' ? 'Quote' : quoteProvider === 'local' ? '本地' : '...') : '已关闭'}</div>
                <button className="w-6 h-6 rounded bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 disabled:opacity-50" title="换一条" onClick={fetchQuote} disabled={!quoteEnabled}>
                  <svg className="w-3 h-3 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 8A8 8 0 0 0 4 8m16 8a8 8 0 0 1-16 0"/></svg>
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className={`pt-4 pr-4 pb-4 pl-20 w-full`}>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'repo' && <Repo />}
          {tab === 'history' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <section className="lg:col-span-3 bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg">
                <div className="text-sm text-slate-300 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="truncate"><span className="text-slate-400">当前仓库：</span><span className="text-slate-200 break-all">{histRepoPath || '—'}</span></div>
                  <div className="truncate"><span className="text-slate-400">数据库：</span><span className="text-slate-200 break-all">{histDbFile || '—'}</span></div>
                </div>
              </section>
              <section className="lg:col-span-1 bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg min-h-[60vh]">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">历史摘要</h3>
                <div className="space-y-1 max-h-[65vh] overflow-auto pr-1">
                  {histItems.length === 0 && <div className="text-xs text-slate-400">最近暂无生成的摘要</div>}
                  {histItems.map(item => (
                    <button key={item.date} onClick={async()=>{ setHistSelectedDate(item.date); try { const d = await (window as any).api?.statsGetDay?.({ date: item.date }); setHistSelected({ date: item.date, summary: String(d?.summary||''), aiScore: d?.aiScore ?? null, localScore: d?.localScore ?? null, progressPercent: d?.progressPercent ?? null, aiModel: (d as any)?.aiModel ?? null, aiProvider: (d as any)?.aiProvider ?? null, lastGenAt: (d as any)?.lastGenAt ?? null }); } catch {} }} className={`w-full text-left px-2 py-2 rounded border ${histSelectedDate===item.date ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-700/70 hover:bg-slate-700/50'} transition-colors`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-slate-100">{item.date}</div>
                        <div className="text-[11px] text-slate-400">基 {item.baseScore}{typeof item.trend==='number' ? ` (${item.trend>=0?'+':''}${item.trend})` : ''}</div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">AI {(item.aiScore??'—')} · 本地 {(item.localScore??'—')} {item.lastGenAt ? `· ${new Date(Number(item.lastGenAt)).toLocaleString()}` : ''}</div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="lg:col-span-2 bg-gradient-to-b from-slate-800/80 to-slate-900/60 rounded p-4 border border-slate-700/70 shadow-lg min-h-[60vh]">
                <h3 className="text-sm font-semibold text-slate-100 mb-1">{histSelected?.date || '选择一个日期'}</h3>
                {histSelected ? (
                  <div className="prose prose-invert max-w-none text-slate-200">
                    <div className="text-xs text-slate-400 mb-2">
                      {(histSelected.lastGenAt ? `上次: ${new Date(Number(histSelected.lastGenAt)).toLocaleString()} · ` : '')}
                      {(typeof histSelected.progressPercent==='number') ? `进度: ${histSelected.progressPercent}% · ` : ''}
                      {(typeof histSelected.aiScore==='number') ? `AI: ${histSelected.aiScore} · ` : ''}
                      {(typeof histSelected.localScore==='number') ? `本地: ${histSelected.localScore}` : ''}
                    </div>
                    {(() => {
                      let mdSource = String(histSelected.summary || '');
                      const raw = mdSource;
                      // parse plain JSON object with markdown/summary/text fields
                      if (/^\s*\{[\s\S]*\}\s*$/.test(raw)) {
                        try {
                          const obj = JSON.parse(raw);
                          let md = obj?.markdown ?? obj?.summary ?? obj?.text;
                          if (typeof md === 'string' && md.trim()) {
                            md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            mdSource = md;
                          }
                        } catch {}
                      }
                      // strip fenced JSON blocks ```...``` if they contain a markdown field
                      if (mdSource.includes('```')) {
                        const fenceRe = /```[a-zA-Z0-9]*\r?\n([\s\S]*?)\r?\n```/g;
                        mdSource = mdSource.replace(fenceRe, (_m, inner) => {
                          try {
                            const obj = JSON.parse(String(inner));
                            let md = obj?.markdown ?? obj?.summary ?? obj?.text;
                            if (typeof md === 'string' && md.trim()) {
                              md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                              return md;
                            }
                          } catch {}
                          return _m;
                        });
                        const inlineFenceRe = /```[a-zA-Z0-9]*\s*(\{[\s\S]*?\})\s*```/g;
                        mdSource = mdSource.replace(inlineFenceRe, (_m, inner) => {
                          try {
                            const obj = JSON.parse(String(inner));
                            let md = obj?.markdown ?? obj?.summary ?? obj?.text;
                            if (typeof md === 'string' && md.trim()) {
                              md = md.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                              return md;
                            }
                          } catch {}
                          return _m;
                        });
                      }
                      return (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {mdSource || '（无内容）'}
                        </ReactMarkdown>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-slate-400">请选择左侧日期以查看当日总结</div>
                )}
              </section>
            </div>
          )}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}

export default App;
