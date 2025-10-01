import React, { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/Settings';
import TitleBar from '@/components/TitleBar';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
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

  const Icon = ({ name }: { name: 'dashboard'|'history'|'settings' }) => {
    const common = 'w-4 h-4';
    if (name === 'dashboard') return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z"/>
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

  const navItem = (key: 'dashboard'|'history'|'settings', label: string) => {
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
              <div className="flex-1 flex flex-col items-center gap-3 justify-center">
                <button className="w-9 h-9 rounded-lg hover:bg-slate-700/60 text-slate-300" title="仪表盘" onClick={() => setTab('dashboard')}>
                  <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z"/></svg>
                </button>
                <button className="w-9 h-9 rounded-lg hover:bg-slate-700/60 text-slate-300" title="历史" onClick={() => setTab('history')}>
                  <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 0 3-6.708V3M3 3v6h6"/><path d="M12 7v6l4 2"/></svg>
                </button>
                <button className="w-9 h-9 rounded-lg hover:bg-slate-700/60 text-slate-300" title="设置" onClick={() => setTab('settings')}>
                  <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l9 4.5-9 4.5-9-4.5Z"/><path d="M3 12l9 4.5 9-4.5"/></svg>
                </button>
              </div>
              <div className="text-[10px] text-slate-500 rotate-180 writing-mode-vertical-lr" style={{ writingMode: 'vertical-rl' }}>Achievo</div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className={`pt-4 pr-4 pb-4 pl-14 w-full`}> 
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'history' && (
            <div className="bg-slate-800 rounded p-4 border border-slate-700">
              <div className="text-slate-300">历史图表已移动到仪表盘中。</div>
            </div>
          )}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}

export default App;
