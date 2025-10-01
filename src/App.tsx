import React, { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/Settings';
import TitleBar from '@/components/TitleBar';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);

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
          className="fixed top-[36px] left-0 h-[calc(100vh-36px)] z-40"
          onMouseEnter={() => !sidebarPinned && setSidebarOpen(true)}
          style={{ width: sidebarOpen ? 0 : 12 }}
        />

        {/* Sidebar */}
        <aside
          className={`fixed top=[36px] left-0 h-[calc(100vh-36px)] bg-gradient-to-b from-slate-800/95 via-slate-800/80 to-slate-900/90
          border-r border-slate-700/80 backdrop-blur-md transition-all duration-200 z-50 shadow-xl ${sidebarOpen ? 'w-64' : 'w-14'}`}
          onMouseEnter={() => !sidebarPinned && setSidebarOpen(true)}
          onMouseLeave={() => !sidebarPinned && setSidebarOpen(false)}
        >
          <div className="h-full flex flex-col p-2">
            {/* Brand + pin */}
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <span className="text-xs font-bold">A</span>
                </div>
                <div className={`text-sm font-semibold overflow-hidden whitespace-nowrap transition-[opacity] ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>Achievo</div>
              </div>
              <button
                className={`p-1.5 rounded-md border transition-colors ${sidebarPinned ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:bg-slate-700/60'}`}
                title={sidebarPinned ? '取消固定侧边栏' : '固定侧边栏'}
                onClick={() => { setSidebarPinned(v => !v); setSidebarOpen(o => !sidebarPinned ? true : o); }}
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
                {!sidebarOpen && <div className="absolute left-16 top-1/2 -translate-y-1/2 text-xs bg-slate-800/95 border border-slate-600 px-2 py-1 rounded shadow-lg hidden group-hover:block">仪表盘</div>}
              </div>
              <div className="group relative">
                {navItem('history', '历史')}
                {!sidebarOpen && <div className="absolute left-16 top-1/2 -translate-y-1/2 text-xs bg-slate-800/95 border border-slate-600 px-2 py-1 rounded shadow-lg hidden group-hover:block">历史</div>}
              </div>
              <div className="group relative">
                {navItem('settings', '设置')}
                {!sidebarOpen && <div className="absolute left-16 top-1/2 -translate-y-1/2 text-xs bg-slate-800/95 border border-slate-600 px-2 py-1 rounded shadow-lg hidden group-hover:block">设置</div>}
              </div>
            </div>
            <div className={`text-xs text-slate-400 mt-2 px-2 overflow-hidden whitespace-nowrap transition-[opacity] ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>{sidebarPinned ? '已固定侧边栏' : '光标移开自动隐藏'}</div>
          </div>
        </aside>

        {/* Main */}
        <main className={`pt-4 pr-4 pb-4 transition-all duration-200 ${sidebarOpen ? 'ml-64' : 'ml-14'} w-full`}> 
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
