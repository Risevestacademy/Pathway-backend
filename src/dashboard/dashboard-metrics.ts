import {
  computeStreak,
  shiftUtcDay,
  toUtcDay,
  type DayCount,
  type StreakSummary,
} from '../activity/activity-metrics';

export {
  computeStreak,
  shiftUtcDay,
  toUtcDay,
  type DayCount,
  type StreakSummary,
};

export const DEFAULT_HEATMAP_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateWindow {
  from: string;
  to: string;
}

export function buildDateWindow(to: Date, days: number): DateWindow {
  const end = toUtcDay(to);
  return { from: shiftUtcDay(end, -(days - 1)), to: end };
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

export interface WeekStripDay {
  date: string;
  active: boolean;
}

export interface WeekStrip {
  days: WeekStripDay[];
  currentStreak: number;
}

/**
 * The current calendar week (Monday to Sunday) containing `today`, in UTC.
 * `currentStreak` is passed in so the service computes it once and shares it.
 */
export function buildWeekStrip(
  dayCounts: DayCount[],
  today: Date,
  currentStreak: number,
): WeekStrip {
  const counts = new Map(dayCounts.map(({ date, count }) => [date, count]));
  const dow = today.getUTCDay(); // 0 = Sunday
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const monday = shiftUtcDay(toUtcDay(today), -mondayOffset);

  const days: WeekStripDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = shiftUtcDay(monday, i);
    days.push({ date, active: (counts.get(date) ?? 0) > 0 });
  }

  return { days, currentStreak };
}
