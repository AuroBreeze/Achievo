export function calcProgressPercentByPrevLocal(
  currentLocal: number,
  prevLocal: number | null | undefined,
  options?: { defaultDenom?: number; cap?: number }
): number {
  const cap = typeof options?.cap === 'number' ? options.cap : 25;
  const defaultDenom = typeof options?.defaultDenom === 'number' ? options.defaultDenom : 50;
  const denom = Math.max(1, (typeof prevLocal === 'number' && isFinite(prevLocal) ? prevLocal : defaultDenom));
  let pct = Math.round(((Math.max(0, currentLocal) - denom) / denom) * 100);
  if (pct > cap) pct = cap;
  return pct;
}
