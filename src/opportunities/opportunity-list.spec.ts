import {
  OpportunityType,
  OpportunityVerification,
} from '../generated/prisma/client';
import {
  buildOpportunityListSelect,
  buildOpportunityListWhere,
  OPPORTUNITY_LIST_ORDER_BY,
  OPPORTUNITY_LIST_SELECT,
  SUMMARY_MAX_LENGTH,
  toOpportunityListItem,
  toOpportunityListItemWithSave,
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

  it('shows a listing with no deadline as OPEN', () => {
    expect(
      toOpportunityListItem(
        { ...row, deadline: null, deadlineUnknown: true },
        now,
      ).status,
    ).toBe('OPEN');
  });
});

describe('buildOpportunityListWhere with saved', () => {
  it('filters to the caller’s saves when saved=true', () => {
    expect(
      buildOpportunityListWhere({ saved: true, userId: 'user-1' }, now),
    ).toMatchObject({ saves: { some: { userId: 'user-1' } } });
  });

  it('ignores saved when no userId is present', () => {
    expect(buildOpportunityListWhere({ saved: true }, now)).not.toHaveProperty(
      'saves',
    );
  });

  it('does not filter by saves when saved is false or omitted', () => {
    expect(
      buildOpportunityListWhere({ userId: 'user-1' }, now),
    ).not.toHaveProperty('saves');
    expect(
      buildOpportunityListWhere({ saved: false, userId: 'user-1' }, now),
    ).not.toHaveProperty('saves');
  });
});

describe('buildOpportunityListSelect', () => {
  it('returns the anonymous shape when no user id is given', () => {
    expect(buildOpportunityListSelect()).toBe(OPPORTUNITY_LIST_SELECT);
  });

  it('adds a user-scoped saves relation when a user id is given', () => {
    expect(buildOpportunityListSelect('user-1')).toMatchObject({
      saves: { where: { userId: 'user-1' }, select: { userId: true } },
    });
  });
});

describe('toOpportunityListItemWithSave', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');
  const base = {
    id: 'opp-1',
    title: 'Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Org',
    location: 'Remote',
    description: 'Short.',
    verification: OpportunityVerification.VERIFIED,
    deadline: new Date('2026-12-06T12:00:00.000Z'),
    deadlineUnknown: false,
  };

  it('sets isSaved true when the caller’s save is present', () => {
    expect(
      toOpportunityListItemWithSave(
        { ...base, saves: [{ userId: 'u-1' }] },
        now,
      ),
    ).toMatchObject({ isSaved: true, id: 'opp-1' });
  });

  it('sets isSaved false when the caller has not saved it', () => {
    expect(
      toOpportunityListItemWithSave({ ...base, saves: [] }, now),
    ).toMatchObject({ isSaved: false });
  });
});
