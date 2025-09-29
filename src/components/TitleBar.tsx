import React, { useEffect, useState } from 'react';

function TitleBar() {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const initial = await window.api?.windowIsMaximized?.();
        setIsMax(!!initial);
      } catch {}
      if (window.api?.onWindowMaximizeChanged) {
        unsub = window.api.onWindowMaximizeChanged((v) => setIsMax(!!v));
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <div className="titlebar flex items-center justify-between select-none bg-slate-900 border-b border-slate-800" style={{ height: 36, paddingInline: 8 }}>
      <div className="text-xs text-slate-400">Achievo</div>
      <div className="flex items-center gap-1 no-drag">
        <button
          title="最小化"
          onClick={() => window.api?.windowMinimize?.()}
          className="px-2 h-7 rounded hover:bg-slate-800 text-slate-300"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="5" width="8" height="1" rx="0.5"/></svg>
        </button>
        <button
          title={isMax ? '还原' : '最大化'}
          onClick={async () => {
            const v = await window.api?.windowToggleMaximize?.();
            setIsMax(!!v);
          }}
          className="px-2 h-7 rounded hover:bg-slate-800 text-slate-300"
        >
          {isMax ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 2h6v6H6V4H2V2z"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="2" width="6" height="6" rx="1"/></svg>
          )}
        </button>
        <button
          title="关闭"
          onClick={() => window.api?.windowClose?.()}
          className="px-2 h-7 rounded hover:bg-red-600/20 text-red-400"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.2 2.2l5.6 5.6M7.8 2.2L2.2 7.8" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
