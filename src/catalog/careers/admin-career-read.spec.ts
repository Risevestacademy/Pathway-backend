import { CareerStatus } from '../../generated/prisma/client';
import {
  ADMIN_CAREER_MAX_STEPS,
  ADMIN_STEP_MAX_RESOURCES,
  type AdminCareerDetailRow,
  adminCareerDetailSelect,
  buildAdminCareerWhere,
  toAdminCareerDetail,
} from './admin-career-read';

describe('buildAdminCareerWhere', () => {
  it('matches every career, drafts included, when no filter is given', () => {
    expect(buildAdminCareerWhere({})).toEqual({});
  });

  it('filters by status', () => {
    expect(buildAdminCareerWhere({ status: CareerStatus.DRAFT })).toEqual({
      status: CareerStatus.DRAFT,
    });
  });

  it('searches the title or slug, ignoring case', () => {
    expect(buildAdminCareerWhere({ search: 'Data' })).toEqual({
      OR: [
        { title: { contains: 'Data', mode: 'insensitive' } },
        { slug: { contains: 'Data', mode: 'insensitive' } },
      ],
    });
  });

  it('trims the search and ignores a blank one', () => {
    expect(buildAdminCareerWhere({ search: '  data  ' })).toEqual(
      buildAdminCareerWhere({ search: 'data' }),
    );
    expect(buildAdminCareerWhere({ search: '   ' })).toEqual({});
  });

  it('combines status and search', () => {
    const where = buildAdminCareerWhere({
      status: CareerStatus.RETIRED,
      search: 'x',
    });

    expect(where.status).toBe(CareerStatus.RETIRED);
    expect(where.OR).toHaveLength(2);
  });
});

describe('adminCareerDetailSelect', () => {
  it('caps the steps and the resources per step', () => {
    const steps = adminCareerDetailSelect.pathway.select.steps;

    expect(steps.take).toBe(ADMIN_CAREER_MAX_STEPS);
    expect(steps.select.resources.take).toBe(ADMIN_STEP_MAX_RESOURCES);
  });

  it.each([
    'revisions',
    'feedback',
    'userPathways',
    'publishedBy',
    'reviewedBy',
  ])('never selects %s', (relation) => {
    expect(adminCareerDetailSelect).not.toHaveProperty(relation);
  });
});

describe('toAdminCareerDetail', () => {
  const decimal = (value: string) => ({ toString: () => value });

  const row = {
    id: 'c1',
    slug: 'draft',
    title: 'Draft',
    skills: [
      { importance: 'REQUIRED', skill: { id: 's1', name: 'TypeScript' } },
    ],
    outlook: [
      {
        id: 'o1',
        median: decimal('95000.00'),
        percentile25: null,
        percentile75: null,
        growthPercent: decimal('8.00'),
        source: { id: 'src1', name: 'BLS', url: null, lastCheckedAt: null },
      },
    ],
    pathway: {
      id: 'p1',
      title: 'Path',
      description: null,
      steps: [
        {
          id: 'st1',
          order: 1,
          skills: [{ skill: { id: 's1', name: 'TypeScript' } }],
          resources: [{ resource: { id: 'r1', status: 'WITHDRAWN' } }],
        },
      ],
    },
  } as unknown as AdminCareerDetailRow;

  it('flattens skills and serializes decimals as strings', () => {
    const result = toAdminCareerDetail(row);

    expect(result.skills).toEqual([
      { id: 's1', name: 'TypeScript', importance: 'REQUIRED' },
    ]);
    expect(result.outlook[0].median).toBe('95000.00');
    expect(result.outlook[0].percentile25).toBeNull();
    expect(result.outlook[0].growthPercent).toBe('8.00');
  });

  it('flattens step skills and keeps withdrawn resources', () => {
    const [step] = toAdminCareerDetail(row).pathway!.steps;

    expect(step.skills).toEqual([{ id: 's1', name: 'TypeScript' }]);
    expect(step.resources).toEqual([{ id: 'r1', status: 'WITHDRAWN' }]);
  });

  it('passes a missing pathway through as null', () => {
    expect(
      toAdminCareerDetail({ ...row, pathway: null } as AdminCareerDetailRow)
        .pathway,
    ).toBeNull();
  });
});
