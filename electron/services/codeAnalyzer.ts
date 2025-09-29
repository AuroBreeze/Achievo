export type DiffStat = {
  added: number;
  removed: number;
  changed: number;
  totalBefore: number;
  totalAfter: number;
};

// A simple line-by-line diff to keep MVP dependency-light
export function analyzeDiff(before: string, after: string): DiffStat {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);

  let added = 0, removed = 0, changed = 0;

  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === undefined && a !== undefined) added++;
    else if (b !== undefined && a === undefined) removed++;
    else if (b !== a) changed++;
  }

  return {
    added,
    removed,
    changed,
    totalBefore: beforeLines.length,
    totalAfter: afterLines.length,
  };
}
