import React, { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/Settings';
import HistoryChart from '@/components/HistoryChart';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');

  useEffect(() => {
    document.title = 'Achievo';
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Achievo · 代码进步追踪器</h1>
        <nav className="space-x-2">
          <button className={`px-3 py-1 rounded ${tab==='dashboard' ? 'bg-indigo-600' : 'bg-slate-800'}`} onClick={() => setTab('dashboard')}>仪表板</button>
          <button className={`px-3 py-1 rounded ${tab==='history' ? 'bg-indigo-600' : 'bg-slate-800'}`} onClick={() => setTab('history')}>历史</button>
          <button className={`px-3 py-1 rounded ${tab==='settings' ? 'bg-indigo-600' : 'bg-slate-800'}`} onClick={() => setTab('settings')}>设置</button>
        </nav>
      </header>
      <main className="p-4">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'history' && <HistoryChart />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
