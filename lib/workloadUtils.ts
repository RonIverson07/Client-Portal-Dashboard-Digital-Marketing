/** Parse YYYY-MM-DD or ISO date to local midnight. */
export function parseTaskDate(value?: string | null): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inclusive calendar days between start and end (e.g. 25–27 → 3). */
export function daysInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

export interface WorkloadTaskInput {
  timeEstimateHours?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}

/** Spread time estimate evenly across start→due (ClickUp-style). */
export function distributeTaskHours(task: WorkloadTaskInput): Record<string, number> {
  const hours = Number(task.timeEstimateHours) || 0;
  if (hours <= 0) return {};

  const start = parseTaskDate(task.startDate);
  const due = parseTaskDate(task.dueDate);

  let rangeStart: Date;
  let rangeEnd: Date;

  if (start && due) {
    rangeStart = start <= due ? start : due;
    rangeEnd = start <= due ? due : start;
  } else if (due) {
    rangeStart = due;
    rangeEnd = due;
  } else if (start) {
    rangeStart = start;
    rangeEnd = start;
  } else {
    return {};
  }

  const dayCount = daysInclusive(rangeStart, rangeEnd);
  const perDay = hours / dayCount;
  const result: Record<string, number> = {};
  const cur = new Date(rangeStart);

  while (cur <= rangeEnd) {
    const key = toDateKey(cur);
    result[key] = (result[key] ?? 0) + perDay;
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

export function formatWorkloadHours(hours: number): string {
  if (hours <= 0) return '0h';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

export function sumHoursInRange(
  distribution: Record<string, number>,
  rangeStart: Date,
  rangeDays: number
): number {
  let total = 0;
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    total += distribution[toDateKey(d)] ?? 0;
  }
  return Math.round(total * 10) / 10;
}
