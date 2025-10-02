export type BaseScoreConfig = {
  dailyCapRatio: number; // 0..1 of previous base per day
};

export type BaseScoreInputs = {
  prevBase: number;        // yesterday's base (min 100)
  currentBase: number;     // today's base before update
  insertions: number;
  deletions: number;
  aiScore?: number | null;     // 0..100
  localScore?: number | null;  // 0..100
  cfg: BaseScoreConfig;
};

export type BaseScoreResult = {
  nextBase: number;
  trend: number; // nextBase - prevBase (or relative to yesterday row caller decides)
  debug?: {
    incLines: number;
    aiPart: number;
    incLocal: number;
    dailyInc: number;
    maxDailyAllowance: number;
    alreadyGained: number;
    remainingAllowance: number;
    incApplied: number;
  };
};

/**
 * Compute next base score with diminishing returns on line changes, and limited by dailyCapRatio.
 * Math is aligned with current db_sqljs.ts logic to avoid behavioral changes.
 */
export function computeBaseUpdate(input: BaseScoreInputs): BaseScoreResult {
  const prevBase = Math.max(100, input.prevBase || 100);
  const currentBase = Math.max(100, input.currentBase || prevBase);
  const ins = Math.max(0, input.insertions || 0);
  const del = Math.max(0, input.deletions || 0);
  const ai = Math.max(0, Math.min(100, input.aiScore ?? 0));
  const loc = Math.max(0, Math.min(100, input.localScore ?? 0));

  // Diminishing returns for code churn
  const wAdded = 0.8;
  const wRemoved = 0.4;
  const raw = ins * wAdded + del * wRemoved;
  const alpha = 220;                      // saturation control
  const incLines = 100 * (1 - Math.exp(-raw / alpha)); // ~0..100

  // Blend with AI and local contributions (scale to 0..~100 bucket)
  const aiPart = (ai / 100) * 30;         // up to ~30
  const incLocal = (loc / 100) * 40;      // up to ~40
  const dailyInc = incLines * 0.6 + aiPart + incLocal; // approx up to ~130

  // Allowance based on prevBase and how much already gained today
  const ratio = Math.max(0, Math.min(1, input.cfg.dailyCapRatio));
  const maxDailyAllowance = prevBase * ratio;
  const alreadyGained = Math.max(0, currentBase - prevBase);
  let remainingAllowance = Math.max(0, maxDailyAllowance - alreadyGained);
  if (remainingAllowance < 1) remainingAllowance = 0; // avoid epsilon noise

  const incCapped = Math.min(Math.max(0, dailyInc), remainingAllowance);
  const incApplied = (remainingAllowance <= 0)
    ? 0
    : (incCapped > 0 && incCapped < 1 ? 1 : Math.round(incCapped));

  const nextBase = currentBase + incApplied;
  const trend = nextBase - (input.prevBase || 0);

  return {
    nextBase,
    trend,
    debug: {
      incLines: Math.round(incLines),
      aiPart: Math.round(aiPart),
      incLocal: Math.round(incLocal),
      dailyInc: Math.round(dailyInc),
      maxDailyAllowance: Math.round(maxDailyAllowance),
      alreadyGained: Math.round(alreadyGained),
      remainingAllowance: Math.round(remainingAllowance),
      incApplied,
    }
  };
}
