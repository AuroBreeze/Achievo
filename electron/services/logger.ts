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

function getEnvNsSet(): Set<string> {
  const raw = (process.env.ACHIEVO_DEBUG_NS || '').toLowerCase();
  const set = new Set<string>();
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(ns => set.add(ns));
  return set;
}

let globalLevel: LogLevel = getEnvLevel();
let debugNs: Set<string> = getEnvNsSet();
let filePath: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();
// lazy import to avoid bundling issues in renderer
let fsAsync: typeof import('node:fs/promises') | null = null;

export function setLoggerLevel(level: LogLevel) {
  globalLevel = level;
}

export function setLoggerNamespaces(namespaces: string[]) {
  const set = new Set<string>();
  (namespaces || []).map(s => String(s || '').toLowerCase().trim()).filter(Boolean).forEach(ns => set.add(ns));
  debugNs = set;
}

export function applyLoggerConfig(cfg: { logLevel?: LogLevel; logNamespaces?: string[] } | undefined) {
  if (!cfg) return;
  if (cfg.logLevel && (cfg.logLevel === 'debug' || cfg.logLevel === 'info' || cfg.logLevel === 'error')) {
    setLoggerLevel(cfg.logLevel);
  }
  if (Array.isArray(cfg.logNamespaces)) {
    setLoggerNamespaces(cfg.logNamespaces);
  }
}

export function setLogFile(path: string | null) {
  filePath = path && path.trim() ? path : null;
  if (filePath && !fsAsync) {
    try { fsAsync = require('node:fs/promises'); } catch { fsAsync = null; }
  }
}

function writeJsonl(ns: string, level: LogLevel, payload: any) {
  if (!filePath || !fsAsync) return;
  const now = Date.now();
  const ts_iso = new Date(now).toISOString();
  const line = JSON.stringify({ ts: now, ts_iso, ns, level, ...payload }) + '\n';
  // Serialize writes to avoid interleaving
  writeQueue = writeQueue.then(() => fsAsync!.appendFile(filePath as string, line, 'utf-8')).catch(()=>{});
}

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
    debug: (...args: any[]) => { if (isDebug()) { try { console.debug(prefix, ...args); writeJsonl(ns, 'debug', { args }); } catch { /* noop */ } } },
    info: (...args: any[]) => { if (isInfo()) { try { console.info(prefix, ...args); writeJsonl(ns, 'info', { args }); } catch { /* noop */ } } },
    error: (...args: any[]) => { if (isError()) { try { console.error(prefix, ...args); writeJsonl(ns, 'error', { args }); } catch { /* noop */ } } },
  };
}
