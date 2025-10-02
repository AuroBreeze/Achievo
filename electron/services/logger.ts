// Simple namespaced logger with environment-controlled levels
// Env vars:
// - ACHIEVO_LOG_LEVEL: 'debug' | 'info' | 'error' (default: 'info')
// - ACHIEVO_DEBUG_NS: comma-separated namespaces to enable at debug level (e.g., 'db,score,ai,git')

export type LogLevel = 'debug' | 'info' | 'error';

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, error: 30 };

function getEnvLevel(): LogLevel {
  const v = (process.env.ACHIEVO_LOG_LEVEL || '').toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'error') return v;
  return 'info';
}

function getNsSet(): Set<string> {
  const raw = (process.env.ACHIEVO_DEBUG_NS || '').toLowerCase();
  const set = new Set<string>();
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(ns => set.add(ns));
  return set;
}

const globalLevel: LogLevel = getEnvLevel();
const debugNs = getNsSet();

export function getLogger(namespace: string) {
  const ns = namespace.toLowerCase();
  const isDebug = () => levelOrder[globalLevel] <= levelOrder['debug'] || debugNs.has(ns);
  const isInfo = () => levelOrder[globalLevel] <= levelOrder['info'];
  const isError = () => levelOrder[globalLevel] <= levelOrder['error'];

  const prefix = `[${namespace}]`;

  return {
    enabled: {
      debug: isDebug(),
      info: isInfo(),
      error: isError(),
    },
    debug: (...args: any[]) => { if (isDebug()) { try { console.debug(prefix, ...args); } catch { /* noop */ } } },
    info: (...args: any[]) => { if (isInfo()) { try { console.info(prefix, ...args); } catch { /* noop */ } } },
    error: (...args: any[]) => { if (isError()) { try { console.error(prefix, ...args); } catch { /* noop */ } } },
  };
}
