import React, { useEffect, useState } from 'react';

const SettingsLogging: React.FC = () => {
  const [logLevel, setLogLevel] = useState<'debug'|'info'|'error'>('info');
  const [logNamespacesText, setLogNamespacesText] = useState<string>('');
  const [logToFile, setLogToFile] = useState<boolean>(false);
  const [logFileName, setLogFileName] = useState<string>('achievo.log');
  const [logDir, setLogDir] = useState<string>('');
  const [saved, setSaved] = useState<string>('');

  const refresh = async () => {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (!cfg) return;
      const ll = (cfg as any).logLevel; if (ll === 'debug' || ll === 'info' || ll === 'error') setLogLevel(ll);
      const lns = Array.isArray((cfg as any).logNamespaces) ? ((cfg as any).logNamespaces as string[]) : []; setLogNamespacesText(lns.join(','));
      const ltf = (cfg as any).logToFile; if (typeof ltf === 'boolean') setLogToFile(ltf);
      const lfn = (cfg as any).logFileName; if (typeof lfn === 'string' && lfn.trim()) setLogFileName(lfn);
    } catch {}
    try {
      const p = await (window as any).api?.paths?.(); if (p && typeof p === 'object') setLogDir(p.logDir || '');
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setSaved('');
    try {
      await (window as any).api?.setConfig?.({
        logLevel,
        logNamespaces: logNamespacesText.split(',').map((s:string)=>s.trim()).filter(Boolean),
        logToFile,
        logFileName: (logFileName || 'achievo.log').trim(),
      });
      setSaved('已保存');
      try { window.dispatchEvent(new CustomEvent('config:updated', { detail: { logLevel, logNamespaces: logNamespacesText.split(',').map((s:string)=>s.trim()).filter(Boolean), logToFile, logFileName: (logFileName || 'achievo.log').trim() } })); } catch {}
    } catch {}
  };

  return (
    <section className="bg-gradient-to-b from-slate-800/80 to-slate-900/60 border border-slate-700/70 rounded-lg p-4 shadow-lg">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">日志</h3>
        {saved && <span className="text-green-400 text-sm">{saved}</span>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">日志级别</label>
          <select value={logLevel} onChange={e=>setLogLevel(e.target.value as any)} className="w-40 bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50">
            <option value="debug">debug（调试）</option>
            <option value="info">info（信息）</option>
            <option value="error">error（错误）</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">影响全局日志级别。</p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">日志命名空间（逗号分隔）</label>
          <input value={logNamespacesText} onChange={e=>setLogNamespacesText(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="db,score,ai,git" />
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
          <input value={logFileName} onChange={e=>setLogFileName(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-md p-2 outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="achievo.log" disabled={!logToFile} />
          <p className="text-xs text-slate-500 mt-1">文件将保存在下方“日志目录”中（保存时会按时间戳生成新文件）。</p>
        </div>
        <div className="col-span-1 flex flex-col gap-2">
          <label className="block text-xs text-slate-400 mb-1">日志目录</label>
          <div className="flex items-center gap-2">
            <button onClick={async()=>{ try { const p = await (window as any).api?.paths?.(); setLogDir(p?.logDir||''); } catch{} }} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">刷新路径</button>
            <button onClick={async()=>{ try { await (window as any).api?.openLogDir?.(); } catch{} }} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 transition-colors">打开目录</button>
          </div>
          {logDir && <p className="text-xs text-slate-400 break-all mt-1">{logDir}</p>}
        </div>
      </div>
      <div className="mt-3">
        <button onClick={save} className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow border border-indigo-500/60 transition-colors">保存</button>
      </div>
    </section>
  );
};

export default SettingsLogging;
