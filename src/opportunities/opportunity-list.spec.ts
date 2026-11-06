import {
  OpportunityType,
  OpportunityVerification,
} from '../generated/prisma/client';
import {
  buildOpportunityListWhere,
  OPPORTUNITY_LIST_ORDER_BY,
  SUMMARY_MAX_LENGTH,
  toOpportunityListItem,
  toSummary,
} from './opportunity-list';

const now = new Date('2026-11-06T12:00:00.000Z');
const visibility = {
  OR: [{ deadlineUnknown: true }, { deadline: { gt: now } }],
};

describe('buildOpportunityListWhere', () => {
  it('keeps only verified listings that are rolling or not yet closed', () => {
    expect(buildOpportunityListWhere({}, now)).toEqual({
      verification: OpportunityVerification.VERIFIED,
      AND: [visibility],
    });
  });

  it('filters by type', () => {
    expect(
      buildOpportunityListWhere({ type: OpportunityType.JOB }, now),
    ).toMatchObject({ type: OpportunityType.JOB });
  });

  it('filters by linked career', () => {
    expect(
      buildOpportunityListWhere({ careerId: 'career-1' }, now),
    ).toMatchObject({ careers: { some: { careerId: 'career-1' } } });
  });

  it('leaves out the excluded listing', () => {
    expect(
      buildOpportunityListWhere({ excludeId: 'opp-1' }, now),
    ).toMatchObject({ id: { not: 'opp-1' } });
  });

  it('searches title and organisation ignoring case, alongside visibility', () => {
    expect(buildOpportunityListWhere({ search: 'data' }, now).AND).toEqual([
      visibility,
      {
        OR: [
          { title: { contains: 'data', mode: 'insensitive' } },
          { organisation: { contains: 'data', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('ignores an empty search', () => {
    expect(buildOpportunityListWhere({ search: '' }, now).AND).toEqual([
      visibility,
    ]);
  });

  it('combines every filter', () => {
    expect(
      buildOpportunityListWhere(
        {
          type: OpportunityType.INTERNSHIP,
          careerId: 'career-1',
          excludeId: 'opp-1',
          search: 'data',
        },
        now,
      ),
    ).toMatchObject({
      verification: OpportunityVerification.VERIFIED,
      type: OpportunityType.INTERNSHIP,
      careers: { some: { careerId: 'career-1' } },
      id: { not: 'opp-1' },
    });
  });
});

describe('OPPORTUNITY_LIST_ORDER_BY', () => {
  it('puts dated listings before rolling ones, soonest first, then by id', () => {
    expect(OPPORTUNITY_LIST_ORDER_BY).toEqual([
      { deadlineUnknown: 'asc' },
      { deadline: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });
});

describe('toSummary', () => {
  it('keeps a short description as it is', () => {
    expect(toSummary('  A short one.  ')).toBe('A short one.');
  });

  it('cuts a long description at a word boundary and adds an ellipsis', () => {
    const summary = toSummary(`${'word '.repeat(40)}end`);

    expect(summary.endsWith('word…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH + 1);
  });

  it('cuts a description with no spaces at the limit', () => {
    expect(toSummary('a'.repeat(200))).toBe(`${'a'.repeat(160)}…`);
  });
});

describe('toOpportunityListItem', () => {
  const row = {
    id: 'opp-1',
    title: 'Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Org',
    location: 'Remote',
    description: 'Short.',
    verification: OpportunityVerification.VERIFIED,
    deadline: new Date('2026-11-09T12:00:00.000Z'),
    deadlineUnknown: false,
  };

  it('maps the row with its derived status and summary', () => {
    expect(toOpportunityListItem(row, now)).toEqual({
      id: 'opp-1',
      title: 'Intern',
      type: OpportunityType.INTERNSHIP,
      organisation: 'Org',
      location: 'Remote',
      status: 'CLOSING_SOON',
      deadline: row.deadline,
      summary: 'Short.',
    });
  });

  it('shows a rolling listing as ROLLING', () => {
    expect(
      toOpportunityListItem(
        { ...row, deadline: null, deadlineUnknown: true },
        now,
      ).status,
    ).toBe('ROLLING');
  });
});
