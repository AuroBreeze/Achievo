export function calcProgressPercentByPrevLocal(
  currentLocal: number,
  prevLocal: number | null | undefined,
  options?: { defaultDenom?: number; cap?: number; hasChanges?: boolean }
): number {
  const cap = typeof options?.cap === 'number' ? options.cap : 25;
  const defaultDenom = typeof options?.defaultDenom === 'number' ? options.defaultDenom : 50;
  const denom = Math.max(1, (typeof prevLocal === 'number' && isFinite(prevLocal) ? prevLocal : defaultDenom));
  let pct = Math.round(((Math.max(0, currentLocal) - denom) / denom) * 100);
  // never negative
  if (pct < 0) pct = 0;
  // if there are any code changes, enforce minimum 1%
  if (options?.hasChanges && pct < 1) pct = 1;
  if (pct > cap) pct = cap;
  return pct;
}
