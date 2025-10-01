import type { DiffStat } from './codeAnalyzer';
import type { DiffFeatures } from './diffFeatures';

// New scoring:
// - Weighted sum with emphasis on meaningful edits (changed > added > removed)
// - Diminishing returns via 1 - exp(-x/alpha)
// - Clamp to 0..100
export function scoreProgress(diff: DiffStat): number {
  const wAdded = 1.6;
  const wChanged = 2.2;
  const wRemoved = 0.8;

  const raw = (diff.added || 0) * wAdded + (diff.changed || 0) * wChanged + (diff.removed || 0) * wRemoved;
  // Alpha controls how quickly score saturates; tuned for typical daily changes
  const alpha = 220; // larger => slower saturation
  const score = 100 * (1 - Math.exp(-Math.max(0, raw) / alpha));
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Semantic score from extracted diff features (0..100)
export function scoreFromFeatures(f: DiffFeatures): number {
  // Base components
  const codeComplexity = f.codeFiles * 6 + f.hunks * 3 + Object.keys(f.languages).length * 4;
  const qualitySignals = f.testFiles * 10 + (f.docFiles > 0 ? 4 : 0);
  const riskSignals = (f.dependencyChanges ? 8 : 0) + (f.hasSecuritySensitive ? 12 : 0) + Math.min(f.renameOrMove, 5) * 2;
  // Size with diminishing returns
  const size = Math.max(0, f.additions + f.deletions);
  const sizeBoost = 40 * (1 - Math.exp(-size / 300));

  // Aggregate
  let raw = codeComplexity + qualitySignals + sizeBoost + riskSignals;

  // Penalize if many files but few hunks (potentially cosmetic churn)
  if (f.filesTotal >= 10 && f.hunks <= 5) raw *= 0.85;
  // Reward tests when code changes present
  if (f.codeFiles > 0 && f.testFiles > 0) raw += 6;

  const score = Math.round(Math.max(0, Math.min(100, raw)));
  return score;
}
