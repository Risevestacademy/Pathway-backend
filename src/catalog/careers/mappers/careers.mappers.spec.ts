import {
  ResourceStatus,
  ResourceType,
  SkillImportance,
  TargetLevel,
  CareerStatus,
} from '../../../generated/prisma/client';
import {
  careerDetailSelect,
  careerRequirementsSelect,
  toCareerCard,
  toCareerOverview,
  toCareerProjection,
  toCareerRequirements,
  toCareerDetail,
} from './career.mappers';

// ─── helpers ─────────────────────────────────────────────────────────
const dec = (v: string | null) => (v === null ? null : { toString: () => v });

const expectNoKeyDeep = (obj: unknown, forbidden: string) => {
  const seen: unknown[] = [];
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (seen.includes(v)) return;
    seen.push(v);
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      expect(k).not.toBe(forbidden);
      walk(child);
    }
  };
  walk(obj);
};

// ─── 1. CARD ─────────────────────────────────────────────────────────
describe('toCareerCard', () => {
  it('maps all card fields', () => {
    const row = {
      id: 'c1',
      slug: 'frontend-developer',
      title: 'Frontend Developer',
      description: 'Builds UI.',
      iconKey: 'fe-icon',
      targetLevels: [TargetLevel.STUDENT, TargetLevel.RECENT_GRAD],
      _count: { resources: 30 },
      pathway: { steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
    };
    expect(toCareerCard(row)).toEqual({
      id: 'c1',
      slug: 'frontend-developer',
      title: 'Frontend Developer',
      description: 'Builds UI.',
      iconKey: 'fe-icon',
      targetLevels: [TargetLevel.STUDENT, TargetLevel.RECENT_GRAD],
      topicCount: 3,
      resourceCount: 30,
    });
  });

  it('returns topicCount 0 when pathway is null', () => {
    const row = {
      id: 'c1',
      slug: 'x',
      title: 'X',
      description: 'd',
      iconKey: null,
      targetLevels: [],
      _count: { resources: 0 },
      pathway: null,
    };
    const out = toCareerCard(row);
    expect(out.topicCount).toBe(0);
    expect(out.resourceCount).toBe(0);
  });

  it('returns topicCount 0 when pathway exists with zero steps', () => {
    const row = {
      id: 'c1',
      slug: 'x',
      title: 'X',
      description: 'd',
      iconKey: null,
      targetLevels: [],
      _count: { resources: 5 },
      pathway: { steps: [] },
    };
    expect(toCareerCard(row).topicCount).toBe(0);
    expect(toCareerCard(row).resourceCount).toBe(5);
  });
});

// ─── 2. OVERVIEW ─────────────────────────────────────────────────────
describe('toCareerOverview', () => {
  it('maps overview fields including skills and counts', () => {
    const row = {
      title: 'Frontend Developer',
      description: 'Builds UI.',
      roleSummary: 'What the role involves...',
      exampleActivities: ['Accessible Form UI', 'Automated DB Backup'],
      imageUrl: 'https://cdn/banner.png',
      _count: { resources: 30 },
      pathway: { steps: [{ id: 's1' }, { id: 's2' }] },
      skills: [
        {
          importance: SkillImportance.REQUIRED,
          skill: { id: 'sk1', name: 'HTML' },
        },
        {
          importance: SkillImportance.NICE_TO_HAVE,
          skill: { id: 'sk2', name: 'Testing' },
        },
      ],
    };
    expect(toCareerOverview(row)).toEqual({
      title: 'Frontend Developer',
      description: 'Builds UI.',
      roleSummary: 'What the role involves...',
      exampleActivities: ['Accessible Form UI', 'Automated DB Backup'],
      imageUrl: 'https://cdn/banner.png',
      skills: [
        { id: 'sk1', name: 'HTML', importance: SkillImportance.REQUIRED },
        {
          id: 'sk2',
          name: 'Testing',
          importance: SkillImportance.NICE_TO_HAVE,
        },
      ],
      topicCount: 2,
      resourceCount: 30,
    });
  });

  it('never leaks field / fieldId', () => {
    const row = {
      title: 't',
      description: 'd',
      roleSummary: null,
      exampleActivities: [],
      imageUrl: null,
      _count: { resources: 0 },
      pathway: null,
      skills: [],
    };
    const out = toCareerOverview(row);
    expectNoKeyDeep(out, 'field');
    expectNoKeyDeep(out, 'fieldId');
  });

  it('returns topicCount 0 when pathway is null', () => {
    const row = {
      title: 't',
      description: 'd',
      roleSummary: null,
      exampleActivities: [],
      imageUrl: null,
      _count: { resources: 7 },
      pathway: null,
      skills: [],
    };
    const out = toCareerOverview(row);
    expect(out.topicCount).toBe(0);
    expect(out.resourceCount).toBe(7);
  });
});

// ─── 3. PROJECTION ───────────────────────────────────────────────────
describe('toCareerProjection', () => {
  it('casts Decimal fields to strings and preserves order', () => {
    const row = {
      outlook: [
        {
          id: 'o1',
          type: 'SALARY',
          geography: 'United States',
          sourceId: null,
          period: 'May 2024',
          median: dec('92750.00'),
          percentile25: dec('70000.00'),
          percentile75: dec('120000.00'),
          currency: 'USD',
          payPeriod: 'year',
          grossOrNet: 'gross',
          experienceLevel: 'entry-level',
          baseYear: null,
          baseValue: null,
          projectedYear: null,
          projectedValue: null,
          growthPercent: null,
          demandLevel: null,
        },
        {
          id: 'o2',
          type: 'EMPLOYMENT_GROWTH',
          geography: 'United States',
          sourceId: 'src-1',
          period: '2023–2033',
          median: null,
          percentile25: null,
          percentile75: null,
          currency: null,
          payPeriod: null,
          grossOrNet: null,
          experienceLevel: null,
          baseYear: 208,
          baseValue: 208,
          projectedYear: 225,
          projectedValue: 225,
          growthPercent: dec('8.00'),
          demandLevel: null,
        },
      ],
    };

    const out = toCareerProjection(row);

    expect(out.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(out[0].median).toBe('92750.00');
    expect(out[0].percentile25).toBe('70000.00');
    expect(out[0].percentile75).toBe('120000.00');
    expect(out[1].growthPercent).toBe('8.00');
    expect(out[1].median).toBeNull();
    expect(out[1].baseYear).toBe(208);
    expect(out[1].projectedValue).toBe(225);
  });

  it('returns [] for no outlook rows', () => {
    expect(toCareerProjection({ outlook: [] })).toEqual([]);
  });
});

// ─── 4. REQUIREMENTS ─────────────────────────────────────────────────
const mkResource = (
  overrides: Partial<{
    id: string;
    title: string;
    provider: string;
    url: string;
    type: ResourceType;
    costStatus: 'FREE' | 'PAID' | 'UNKNOWN';
    estimatedWeeks: number | null;
    badgeImageUrl: string | null;
  }> = {},
) => ({
  id: 'r1',
  title: 'UX Designer Fundamentals',
  provider: 'Coursera',
  url: 'https://example.com/course',
  type: ResourceType.COURSE,
  costStatus: 'FREE' as const,
  estimatedWeeks: 6,
  badgeImageUrl: null,
  ...overrides,
});

describe('toCareerRequirements', () => {
  it('groups COURSE into courses and CERTIFICATION into certifications', () => {
    const row = {
      resources: [
        { resource: mkResource({ id: 'c1', type: ResourceType.COURSE }) },
        {
          resource: mkResource({
            id: 'cert1',
            type: ResourceType.CERTIFICATION,
            title: 'Certified UX Practitioner',
            badgeImageUrl: 'https://cdn/badge.png',
            estimatedWeeks: null,
          }),
        },
        { resource: mkResource({ id: 'c2', type: ResourceType.COURSE }) },
      ],
    };
    const out = toCareerRequirements(row);
    expect(out.courses.map((r) => r.id)).toEqual(['c1', 'c2']);
    expect(out.certifications.map((r) => r.id)).toEqual(['cert1']);
    expect(out.certifications[0].badgeImageUrl).toBe('https://cdn/badge.png');
    expect(out.certifications[0].estimatedWeeks).toBeNull();
  });

  it('drops ARTICLE, VIDEO, BOOK resources', () => {
    const row = {
      resources: [
        { resource: mkResource({ id: 'a', type: ResourceType.ARTICLE }) },
        { resource: mkResource({ id: 'v', type: ResourceType.VIDEO }) },
        { resource: mkResource({ id: 'b', type: ResourceType.BOOK }) },
        { resource: mkResource({ id: 'c', type: ResourceType.COURSE }) },
      ],
    };
    const out = toCareerRequirements(row);
    expect(out.courses.map((r) => r.id)).toEqual(['c']);
    expect(out.certifications).toEqual([]);
  });

  it('never includes curationRationale', () => {
    const row = {
      resources: [
        { resource: mkResource({ type: ResourceType.COURSE }) },
        {
          resource: mkResource({
            id: 'cert1',
            type: ResourceType.CERTIFICATION,
            badgeImageUrl: 'https://cdn/badge.png',
          }),
        },
      ],
    };
    const out = toCareerRequirements(row);
    expectNoKeyDeep(out, 'curationRationale');
  });

  it('select filters to ACTIVE resources only', () => {
    const where = careerRequirementsSelect.resources.where;
    expect(where.resource.status).toBe(ResourceStatus.ACTIVE);
  });

  it('returns empty buckets when no linked resources', () => {
    const out = toCareerRequirements({ resources: [] });
    expect(out).toEqual({ courses: [], certifications: [] });
  });

  describe('toCareerDetail', () => {
    it('composes overview, projection and requirements from one row', () => {
      const row = {
        title: 'Frontend Developer',
        description: 'Builds UI.',
        roleSummary: 'What the role involves…',
        exampleActivities: ['Accessible Form UI'],
        imageUrl: 'https://cdn/banner.png',
        _count: { resources: 2 },
        pathway: { steps: [{ id: 's1' }] },
        skills: [
          {
            importance: SkillImportance.REQUIRED,
            skill: { id: 'sk1', name: 'HTML' },
          },
        ],
        outlook: [
          {
            id: 'o1',
            type: 'SALARY',
            geography: 'United States',
            sourceId: null,
            period: 'May 2024',
            median: dec('92750.00'),
            percentile25: null,
            percentile75: null,
            currency: 'USD',
            payPeriod: 'year',
            grossOrNet: 'gross',
            experienceLevel: 'entry-level',
            baseYear: null,
            baseValue: null,
            projectedYear: null,
            projectedValue: null,
            growthPercent: null,
            demandLevel: null,
          },
        ],
        resources: [
          {
            resource: {
              id: 'r1',
              title: 'UX Fundamentals',
              provider: 'Coursera',
              url: 'https://example.com',
              type: ResourceType.COURSE,
              costStatus: 'FREE',
              estimatedWeeks: 6,
              badgeImageUrl: null,
            },
          },
          {
            resource: {
              id: 'r2',
              title: 'Certified UX',
              provider: 'NN/g',
              url: 'https://example.com/cert',
              type: ResourceType.CERTIFICATION,
              costStatus: 'PAID',
              estimatedWeeks: null,
              badgeImageUrl: 'https://cdn/badge.png',
            },
          },
        ],
      };

      const out = toCareerDetail(row);

      expect(out.overview.title).toBe('Frontend Developer');
      expect(out.overview.topicCount).toBe(1);
      expect(out.overview.resourceCount).toBe(2);
      expect(out.overview.skills).toEqual([
        { id: 'sk1', name: 'HTML', importance: SkillImportance.REQUIRED },
      ]);
      expect(out.projection).toHaveLength(1);
      expect(out.projection[0].median).toBe('92750.00');
      expect(out.requirements.courses.map((r) => r.id)).toEqual(['r1']);
      expect(out.requirements.certifications.map((r) => r.id)).toEqual(['r2']);
    });

    it('never leaks curationRationale or field', () => {
      const row = {
        title: 't',
        description: 'd',
        roleSummary: null,
        exampleActivities: [],
        imageUrl: null,
        _count: { resources: 0 },
        pathway: null,
        skills: [],
        outlook: [],
        resources: [],
      };
      const out = toCareerDetail(row);
      expectNoKeyDeep(out, 'curationRationale');
      expectNoKeyDeep(out, 'field');
      expectNoKeyDeep(out, 'fieldId');
    });
  });

  describe('careerDetailSelect', () => {
    it('merges the three section selects without collisions', () => {
      expect(careerDetailSelect.skills).toBeDefined();
      expect(careerDetailSelect.outlook).toMatchObject({
        orderBy: { createdAt: 'asc' },
      });
      const resources = careerDetailSelect.resources as {
        where: { resource: { status: ResourceStatus } };
      };
      expect(resources.where.resource.status).toBe(ResourceStatus.ACTIVE);
      expect(careerDetailSelect._count).toEqual({
        select: { resources: true },
      });
      expect(careerDetailSelect.pathway).toEqual({
        select: { steps: { select: { id: true } } },
      });
    });
  });
});
