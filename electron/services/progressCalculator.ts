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

// Complex blended model combining: trend vs prevBase, localScore, aiScore, totalChanges
// Returns percent in 0..cap, enforces min 1% when hasChanges
export function calcProgressPercentComplex(params: {
  trend: number;            // today's base - yesterday's base
  prevBase: number;         // yesterday's base
  localScore: number;       // 0..100
  aiScore: number;          // 0..100
  totalChanges: number;     // insertions + deletions
  hasChanges: boolean;      // whether there is any effective change
  cap?: number;             // default 25
}): number {
  const cap = typeof params.cap === 'number' ? params.cap : 25;
  const prevBase = Math.max(100, Math.max(0, params.prevBase));
  const trendPos = Math.max(0, params.trend);
  const local = Math.max(0, Math.min(100, params.localScore));
  const ai = Math.max(0, Math.min(100, params.aiScore));
  const total = Math.max(0, params.totalChanges);

  // Normalize components to 0..1 with diminishing returns for total changes
  const trendNorm = trendPos / prevBase;                   // relative gain
  const localNorm = local / 100;                           // semantic progress
  const aiNorm = ai / 100;                                 // ai assessment
  const changesNorm = 1 - Math.exp(-total / 300);          // saturates around a few hundred LoC

  // Weights (sum ~= 1). Tuneable.
  const wTrend = 0.40;
  const wLocal = 0.30;
  const wAI = 0.20;
  const wChanges = 0.10;

  const score = wTrend * trendNorm + wLocal * localNorm + wAI * aiNorm + wChanges * changesNorm;
  let pct = Math.round(cap * score);
  if (pct < 0) pct = 0;
  if (params.hasChanges && pct < 1) pct = 1;
  if (pct > cap) pct = cap;
  return pct;
}
