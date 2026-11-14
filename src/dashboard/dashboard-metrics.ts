export const DEFAULT_HEATMAP_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateWindow {
  from: string;
  to: string;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface StreakSummary {
  current: number;
  longest: number;
}

export function toUtcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function shiftUtcDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function buildDateWindow(to: Date, days: number): DateWindow {
  const end = toUtcDay(to);
  return { from: shiftUtcDay(end, -(days - 1)), to: end };
}

export function computeStreak(
  dayCounts: DayCount[],
  today: Date,
): StreakSummary {
  const active = new Set(
    dayCounts.filter(({ count }) => count > 0).map(({ date }) => date),
  );

  if (active.size === 0) {
    return { current: 0, longest: 0 };
  }

  const end = toUtcDay(today);
  let anchor = active.has(end) ? end : shiftUtcDay(end, -1);
  let current = 0;

  while (active.has(anchor)) {
    current += 1;
    anchor = shiftUtcDay(anchor, -1);
  }

  const ordered = [...active].sort((a, b) => a.localeCompare(b));
  let longest = 1;
  let run = 1;

  for (let i = 1; i < ordered.length; i += 1) {
    run = ordered[i] === shiftUtcDay(ordered[i - 1], 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  return { current, longest };
}

export function buildHeatmap(
  dayCounts: DayCount[],
  window: DateWindow,
): DayCount[] {
  const counts = new Map(dayCounts.map(({ date, count }) => [date, count]));
  const days: DayCount[] = [];

  for (let day = window.from; day <= window.to; day = shiftUtcDay(day, 1)) {
    days.push({ date: day, count: counts.get(day) ?? 0 });
  }

  return days;
}
