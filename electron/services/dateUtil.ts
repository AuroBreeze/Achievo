export function todayKey(): string {
  // Use LOCAL date to stay consistent across services and IPC
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function toKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function yesterdayKey(key: string): string {
  // key format: YYYY-MM-DD
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return toKey(d);
}
