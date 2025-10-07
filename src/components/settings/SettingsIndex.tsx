import React, { useState } from 'react';
import SettingsAI from './SettingsAI';
import SettingsDisplay from './SettingsDisplay';
import SettingsDatabase from './SettingsDatabase';
import SettingsLogging from './SettingsLogging';
import SettingsScoring from './SettingsScoring';

const TABS: Array<{ key: 'ai'|'display'|'database'|'logging'|'scoring'; label: string }> = [
  { key: 'ai', label: 'AI' },
  { key: 'display', label: '显示' },
  { key: 'database', label: '数据库' },
  { key: 'logging', label: '日志' },
  { key: 'scoring', label: '进步分' },
];

const SettingsIndex: React.FC = () => {
  const [tab, setTab] = useState<'ai'|'display'|'database'|'logging'|'scoring'>(() => {
    try {
      const v = localStorage.getItem('settings:lastTab');
      if (v === 'ai' || v === 'display' || v === 'database' || v === 'logging' || v === 'scoring') return v;
    } catch {}
    return 'ai';
  });

  const onSwitch = (key: 'ai'|'display'|'database'|'logging'|'scoring') => {
    setTab(key);
    try { localStorage.setItem('settings:lastTab', key); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => onSwitch(t.key)}
            className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${tab === t.key ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'bg-slate-800/60 border-slate-600 text-slate-300 hover:bg-slate-700/60'}`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'ai' && <SettingsAI />}
      {tab === 'display' && <SettingsDisplay />}
      {tab === 'database' && <SettingsDatabase />}
      {tab === 'logging' && <SettingsLogging />}
      {tab === 'scoring' && <SettingsScoring />}
    </div>
  );
};

export default SettingsIndex;
