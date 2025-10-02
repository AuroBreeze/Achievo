// Percent vs previous local baseline (legacy fallback)
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

// Percentile/ECDF-based normalization: map raw score to its empirical percentile among samples.
// Robust to non-normal; matches "learning curve" over user's own history.
export function normalizeLocalByECDF(
  rawLocal: number,
  samples: number[],
  opts?: { cap?: number; winsor?: { pLow?: number; pHigh?: number } }
): number {
  const cap = typeof opts?.cap === 'number' ? opts.cap : 85;
  const arr = (samples || []).filter(v => typeof v === 'number' && isFinite(v)) as number[];
  if (arr.length === 0) return Math.min(cap, Math.max(0, Math.round(rawLocal)));
  const sorted = arr.slice().sort((a, b) => a - b);

  // Winsorization: clamp raw to [q_low, q_high] to reduce tail influence
  const pLow = typeof opts?.winsor?.pLow === 'number' ? opts!.winsor!.pLow! : 0.05;
  const pHigh = typeof opts?.winsor?.pHigh === 'number' ? opts!.winsor!.pHigh! : 0.95;
  const qLow = quantile(sorted, pLow);
  const qHigh = quantile(sorted, pHigh);
  const x = Math.min(qHigh, Math.max(qLow, rawLocal));

  // ECDF with linear interpolation between nearest ranks
  let idx = binarySearch(sorted, x);
  if (idx < 0) idx = ~idx; // insertion point
  const n = sorted.length;
  let pct: number;
  if (idx <= 0) pct = 0;
  else if (idx >= n) pct = 1;
  else {
    const x0 = sorted[idx - 1];
    const x1 = sorted[idx];
    const t = x1 === x0 ? 1 : (x - x0) / (x1 - x0);
    pct = ((idx - 1) + t) / (n - 1);
  }
  const out = Math.round(100 * pct);
  return Math.max(0, Math.min(cap, out));
}

function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const clampedP = Math.max(0, Math.min(1, p));
  const pos = (n - 1) * clampedP;
  const i = Math.floor(pos);
  const frac = pos - i;
  if (i + 1 >= n) return sortedAsc[n - 1];
  return sortedAsc[i] * (1 - frac) + sortedAsc[i + 1] * frac;
}

// Return index of x in sorted array, or bitwise complement of insertion point if not found
function binarySearch(arr: number[], x: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === x) return mid;
    if (arr[mid] < x) lo = mid + 1; else hi = mid - 1;
  }
  return ~lo;
}

// Normalize a raw local semantic score (0..100) to a "Gaussian-like" distribution via logistic S-curve.
// Midpoint controls where growth slows (default around 60), slope controls steepness of the S curve.
export function normalizeLocalGaussian(rawLocal: number, opts?: { midpoint?: number; slope?: number }): number {
  const x = Math.max(0, Math.min(100, rawLocal));
  const r = x / 100; // 0..1
  const mid = typeof opts?.midpoint === 'number' ? Math.max(0, Math.min(100, opts.midpoint)) / 100 : 0.6;
  const k = typeof opts?.slope === 'number' ? Math.max(1, opts.slope) : 12; // larger => steeper
  const y = 1 / (1 + Math.exp(-k * (r - mid))); // 0..1
  const out = Math.round(100 * y);
  return Math.max(0, Math.min(100, out));
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
  // Make gains beyond 21% increasingly hard with smooth exponential easing towards cap
  const hardThreshold = 21; // percent
  if (pct > hardThreshold) {
    const extra = pct - hardThreshold;
    const lambda = 0.15; // larger => faster approach to cap; tune for normal-like tail
    const span = cap - hardThreshold;
    const eased = span * (1 - Math.exp(-lambda * extra));
    pct = Math.round(hardThreshold + Math.min(span, Math.max(0, eased)));
  }
  if (pct < 0) pct = 0;
  if (params.hasChanges && pct < 1) pct = 1;
  if (pct > cap) pct = cap;
  return pct;
}

// Normalize local score using Normal distribution CDF mapping.
// rawLocal: 0..100. We first map to a z-score with provided mean/std, then apply standard normal CDF,
// finally scale to 0..100. This yields“中段更快、两端更慢”的正态分布型增长。
export function normalizeLocalNormalCDF(
  rawLocal: number,
  opts?: { mean?: number; std?: number }
): number {
  const x = Math.max(0, Math.min(100, rawLocal));
  const mean = typeof opts?.mean === 'number' ? opts.mean : 60; // 默认均值
  const std = typeof opts?.std === 'number' && opts!.std! > 0 ? opts!.std! : 15; // 默认标准差
  const z = (x - mean) / std;
  // 近似标准正态 CDF（Abramowitz and Stegun 7.1.26 近似）
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const p = 1 - d * (0.319381530*t - 0.356563782*Math.pow(t,2) + 1.781477937*Math.pow(t,3) - 1.821255978*Math.pow(t,4) + 1.330274429*Math.pow(t,5));
  const cdf = z >= 0 ? p : (1 - p); // 0..1
  const out = Math.round(100 * cdf);
  return Math.max(0, Math.min(100, out));
}
