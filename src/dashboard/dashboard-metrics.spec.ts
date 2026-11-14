import {
  buildDateWindow,
  buildHeatmap,
  computeStreak,
  DEFAULT_HEATMAP_DAYS,
  shiftUtcDay,
  toUtcDay,
  type DayCount,
} from './dashboard-metrics';

const at = (iso: string) => new Date(iso);
const days = (dates: string[]): DayCount[] =>
  dates.map((date) => ({ date, count: 1 }));

describe('toUtcDay', () => {
  it('takes the UTC day, not the local one', () => {
    expect(toUtcDay(at('2026-11-10T23:30:00.000Z'))).toBe('2026-11-10');
    expect(toUtcDay(at('2026-11-11T00:30:00.000Z'))).toBe('2026-11-11');
  });
});

describe('shiftUtcDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftUtcDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftUtcDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('crosses a leap day', () => {
    expect(shiftUtcDay('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('buildDateWindow', () => {
  it('spans the requested number of days, end inclusive', () => {
    expect(buildDateWindow(at('2026-11-14T08:00:00.000Z'), 7)).toEqual({
      from: '2026-11-08',
      to: '2026-11-14',
    });
  });

  it('is a single day for a window of one', () => {
    expect(buildDateWindow(at('2026-11-14T08:00:00.000Z'), 1)).toEqual({
      from: '2026-11-14',
      to: '2026-11-14',
    });
  });
});

describe('computeStreak', () => {
  const today = at('2026-11-14T08:00:00.000Z');

  it('is zero for a user with no activity', () => {
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today', () => {
    expect(
      computeStreak(days(['2026-11-12', '2026-11-13', '2026-11-14']), today),
    ).toEqual({ current: 3, longest: 3 });
  });

  it('stays alive when the last active day was yesterday', () => {
    expect(
      computeStreak(days(['2026-11-12', '2026-11-13']), today),
    ).toMatchObject({ current: 2 });
  });

  it('is broken once the last active day is two days back', () => {
    expect(
      computeStreak(days(['2026-11-11', '2026-11-12']), today),
    ).toMatchObject({ current: 0 });
  });

  it('resets the current streak across a gap but keeps the longest', () => {
    expect(
      computeStreak(
        days([
          '2026-11-01',
          '2026-11-02',
          '2026-11-03',
          '2026-11-04',
          '2026-11-13',
          '2026-11-14',
        ]),
        today,
      ),
    ).toEqual({ current: 2, longest: 4 });
  });

  it('counts a single active day as a streak of one', () => {
    expect(computeStreak(days(['2026-11-14']), today)).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it('ignores days recorded with a count of zero', () => {
    expect(
      computeStreak(
        [
          { date: '2026-11-13', count: 0 },
          { date: '2026-11-14', count: 2 },
        ],
        today,
      ),
    ).toEqual({ current: 1, longest: 1 });
  });

  it('reads the same whatever order the days arrive in', () => {
    const dates = ['2026-11-14', '2026-11-12', '2026-11-13'];
    expect(computeStreak(days(dates), today)).toEqual(
      computeStreak(days([...dates].reverse()), today),
    );
  });
});

describe('buildHeatmap', () => {
  const window = { from: '2026-11-10', to: '2026-11-14' };

  it('fills days without activity with zero', () => {
    expect(buildHeatmap(days(['2026-11-12']), window)).toEqual([
      { date: '2026-11-10', count: 0 },
      { date: '2026-11-11', count: 0 },
      { date: '2026-11-12', count: 1 },
      { date: '2026-11-13', count: 0 },
      { date: '2026-11-14', count: 0 },
    ]);
  });

  it('reports the raw count for a busy day', () => {
    expect(
      buildHeatmap([{ date: '2026-11-11', count: 3 }], window),
    ).toContainEqual({ date: '2026-11-11', count: 3 });
  });

  it('covers every day of the window, both ends included', () => {
    const heatmap = buildHeatmap(
      [],
      buildDateWindow(at('2026-11-14T08:00:00.000Z'), DEFAULT_HEATMAP_DAYS),
    );

    expect(heatmap).toHaveLength(DEFAULT_HEATMAP_DAYS);
    expect(heatmap[0].date).toBe('2025-11-15');
    expect(heatmap[heatmap.length - 1].date).toBe('2026-11-14');
  });

  it('leaves out activity from before the window', () => {
    expect(buildHeatmap(days(['2026-11-09']), window)).toEqual(
      buildHeatmap([], window),
    );
  });

  it('is all zeros for a user with no activity', () => {
    expect(buildHeatmap([], window).every(({ count }) => count === 0)).toBe(
      true,
    );
  });
});
