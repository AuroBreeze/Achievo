import type { DiffStat } from './codeAnalyzer';

export function scoreProgress(diff: DiffStat): number {
  // Simple heuristic: additions are positive, removals slightly less, changes moderate
  const raw = diff.added * 2 + diff.changed * 1.5 + diff.removed * 1;
  // Normalize roughly by total size to avoid trivial huge scores
  const size = Math.max(1, diff.totalBefore + diff.totalAfter);
  const normalized = (raw / size) * 100;
  // Clamp 0..100
  return Math.max(0, Math.min(100, Math.round(normalized)));
}
