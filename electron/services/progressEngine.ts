import { normalizeLocalByECDF, normalizeLocalNormalCDF } from './progressCalculator';
import { getLogger } from './logger';

export type LocalScoringConfig = {
  coldStartN: number;
  windowDays: number;
  alpha: number;
  capCold: number;
  capStable: number;
  winsorPLow: number;
  winsorPHigh: number;
  normalMean: number;
  normalStd: number;
  regressionCapAfterHigh: number;
  highThreshold: number;
};

export type ComputeLocalInput = {
  rawLocal: number;
  historyRaw: number[];
  cfg: Partial<LocalScoringConfig>;
  prevLocal?: number;        // yesterday's displayed local score (0..100)
  prevLocalRaw?: number | null; // yesterday's raw local score
};

export type ComputeLocalOutput = {
  localScoreRaw: number;
  localScore: number;
  debug?: {
    samples: number;
    coldStart: boolean;
    cap: number;
    beforeSmooth: number;
    prevLocal?: number;
    prevLocalRaw?: number | null;
    prevLocalNorm?: number;
    alpha: number;
    afterSmooth: number;
  };
};

const defaults: LocalScoringConfig = {
  coldStartN: 3,
  windowDays: 30,
  alpha: 0.65,
  capCold: 98,
  capStable: 85,
  winsorPLow: 0.05,
  winsorPHigh: 0.95,
  normalMean: 88,
  normalStd: 14,
  regressionCapAfterHigh: 80,
  highThreshold: 95,
};

export function computeLocalProgress(input: ComputeLocalInput): ComputeLocalOutput {
  const cfg: LocalScoringConfig = { ...defaults, ...(input.cfg || {}) } as LocalScoringConfig;
  const samples = (input.historyRaw || []).filter(v => typeof v === 'number' && isFinite(v));

  const coldStart = samples.length < Math.max(0, cfg.coldStartN);
  const cap = Math.max(0, Math.min(100, coldStart ? cfg.capCold : cfg.capStable));

  const beforeSmooth = coldStart
    ? Math.min(cap, Math.round(normalizeLocalNormalCDF(input.rawLocal, { mean: cfg.normalMean, std: cfg.normalStd }) * 0.9))
    : normalizeLocalByECDF(input.rawLocal, samples, { cap, winsor: { pLow: cfg.winsorPLow, pHigh: cfg.winsorPHigh } });

  // Smoothing and regression to mean
  let localScore = beforeSmooth;
  let prevNorm: number | undefined;
  if (typeof input.prevLocal === 'number') {
    prevNorm = coldStart
      ? Math.min(cap, Math.round(normalizeLocalNormalCDF(input.prevLocal, { mean: cfg.normalMean, std: cfg.normalStd }) * 0.9))
      : (typeof input.prevLocalRaw === 'number'
        ? normalizeLocalByECDF(input.prevLocalRaw, samples, { cap, winsor: { pLow: cfg.winsorPLow, pHigh: cfg.winsorPHigh } })
        : input.prevLocal);
    const alpha = Math.max(0, Math.min(1, cfg.alpha));
    const blended = Math.round(alpha * localScore + (1 - alpha) * (Math.max(0, Math.min(100, prevNorm))));
    localScore = Math.min(localScore, blended);
    if (input.prevLocal >= Math.max(0, Math.min(100, cfg.highThreshold))) {
      localScore = Math.min(localScore, Math.max(0, Math.min(100, cfg.regressionCapAfterHigh)));
    }
  }

  const logger = getLogger('score');
  const debug = logger.enabled.debug ? {
    samples: samples.length,
    coldStart,
    cap,
    beforeSmooth,
    prevLocal: input.prevLocal,
    prevLocalRaw: input.prevLocalRaw ?? null,
    prevLocalNorm: prevNorm,
    alpha: Math.max(0, Math.min(1, cfg.alpha)),
    afterSmooth: localScore,
  } : undefined;
  if (logger.enabled.debug) {
    logger.debug('computeLocalProgress', { samples: samples.length, coldStart, cap, beforeSmooth, prevLocal: input.prevLocal, prevLocalRaw: input.prevLocalRaw ?? null, prevLocalNorm: prevNorm, alpha: Math.max(0, Math.min(1, cfg.alpha)), afterSmooth: localScore });
  }

  return { localScoreRaw: input.rawLocal, localScore, debug };
}
