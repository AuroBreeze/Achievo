import React from 'react';

type ToastMsg = { id: number; text: string; type?: 'info'|'success'|'error' };

const ToastContainer: React.FC = () => {
  const [items, setItems] = React.useState<ToastMsg[]>([]);
  const idRef = React.useRef(1);

  React.useEffect(() => {
    const onShow = (e: any) => {
      const detail = (e && e.detail) || {};
      const text = String(detail.text || detail) || '';
      if (!text) return;
      const type = (detail.type === 'success' || detail.type === 'error' || detail.type === 'info') ? detail.type : 'info';
      const id = idRef.current++;
      setItems(prev => [...prev, { id, text, type }]);
      // auto remove
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), Math.max(1500, Math.min(6000, Number(detail.ms) || 2200)));
    };
    window.addEventListener('toast:show' as any, onShow as any);
    return () => window.removeEventListener('toast:show' as any, onShow as any);
  }, []);

  const base = 'px-3 py-2 rounded-md border shadow text-sm max-w-sm break-words';

  return (
    <div className="fixed z-[9999] top-12 right-4 flex flex-col gap-2 select-none">
      {items.map(m => (
        <div key={m.id}
          className={
            m.type === 'success' ? `${base} bg-emerald-700/70 border-emerald-500/60 text-emerald-50`
            : m.type === 'error' ? `${base} bg-rose-700/70 border-rose-500/60 text-rose-50`
            : `${base} bg-slate-700/80 border-slate-500/60 text-slate-50`
          }
        >{m.text}</div>
      ))}
    </div>
  );
};

export function showToast(text: string, type?: 'info'|'success'|'error', ms?: number) {
  try { window.dispatchEvent(new CustomEvent('toast:show', { detail: { text, type, ms } })); } catch {}
}

export default ToastContainer;
