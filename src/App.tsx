import React, { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/Settings';
import TitleBar from '@/components/TitleBar';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.title = 'Achievo';
  }, []);

  const navItem = (key: 'dashboard'|'history'|'settings', label: string) => (
    <button
      className={`w-full text-left px-3 py-2 rounded transition-colors ${tab===key ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-200'}`}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <TitleBar />
      {/* Sidebar + Content */}
      <div className="relative flex">
        {/* Hover zone to open sidebar when collapsed */}
        <div
          className="fixed top-[36px] left-0 h-[calc(100vh-36px)] z-40"
          onMouseEnter={() => setSidebarOpen(true)}
          style={{ width: sidebarOpen ? 0 : 12 }}
        />

        {/* Sidebar */}
        <aside
          className={`fixed top-[36px] left-0 h-[calc(100vh-36px)] bg-slate-800/90 border-r border-slate-700 backdrop-blur-sm transition-all duration-200 z-50 ${sidebarOpen ? 'w-56' : 'w-12'}`}
          onMouseEnter={() => setSidebarOpen(true)}
          onMouseLeave={() => setSidebarOpen(false)}
        >
          <div className="h-full flex flex-col p-2">
            <div className={`text-sm font-semibold mb-2 px-2 overflow-hidden whitespace-nowrap transition-[opacity] ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>导航</div>
            <div className="flex-1 space-y-1">
              <div className="group relative">
                {navItem('dashboard', '仪表盘')}
                {!sidebarOpen && <div className="absolute left-14 top-1/2 -translate-y-1/2 text-xs bg-slate-700 px-2 py-1 rounded shadow hidden group-hover:block">仪表盘</div>}
              </div>
              <div className="group relative">
                {navItem('history', '历史')}
                {!sidebarOpen && <div className="absolute left-14 top-1/2 -translate-y-1/2 text-xs bg-slate-700 px-2 py-1 rounded shadow hidden group-hover:block">历史</div>}
              </div>
              <div className="group relative">
                {navItem('settings', '设置')}
                {!sidebarOpen && <div className="absolute left-14 top-1/2 -translate-y-1/2 text-xs bg-slate-700 px-2 py-1 rounded shadow hidden group-hover:block">设置</div>}
              </div>
            </div>
            <div className={`text-xs text-slate-400 mt-2 px-2 overflow-hidden whitespace-nowrap transition-[opacity] ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>光标移开自动隐藏</div>
          </div>
        </aside>

        {/* Main */}
        <main className={`pt-4 pr-4 pb-4 transition-all duration-200 ${sidebarOpen ? 'ml-56' : 'ml-12'} w-full`}> 
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
