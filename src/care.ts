export function addDaysIso(from: Date | string, days: number): string {
  const date = typeof from === "string" ? new Date(from) : new Date(from);
  const offset = Number.isFinite(days) ? Math.round(days) : 0;
  date.setDate(date.getDate() + offset);
  return date.toISOString();
}

export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(iso).getTime();
  const current = now.getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.ceil((target - current) / 86_400_000);
}

export function careDueLabel(iso: string, now = new Date()): string {
  const days = daysUntil(iso, now);
  if (days < 0) return Math.abs(days) + "D OVERDUE";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return days + "D";
}

export function clampInterval(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(365, Math.round(value)));
}
