import {
  Demand,
  OutlookType,
  Prisma,
  SkillImportance,
  TargetLevel,
} from '../../../generated/prisma/client';
import {
  CareerComparisonRow,
  CareerComparisonService,
} from './career-comparison.service';

type OutlookRow = CareerComparisonRow['outlook'][number];

const createdAt = new Date('2026-01-01T00:00:00.000Z');

const outlookRow = (overrides: Partial<OutlookRow>): OutlookRow => ({
  id: 'outlook-1',
  careerId: 'career-a',
  type: OutlookType.SALARY,
  geography: 'Lagos, Nigeria',
  sourceId: 'source-1',
  source: { name: 'Local salary survey', url: 'https://example.com/salaries' },
  period: 'Q2 2025',
  median: new Prisma.Decimal('4500000'),
  percentile25: null,
  percentile75: null,
  currency: 'NGN',
  payPeriod: 'year',
  grossOrNet: 'gross',
  experienceLevel: 'entry-level',
  baseYear: null,
  baseValue: null,
  projectedYear: null,
  projectedValue: null,
  growthPercent: null,
  demandLevel: null,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
});

const demandRow = (overrides: Partial<OutlookRow> = {}): OutlookRow =>
  outlookRow({
    id: 'demand-1',
    type: OutlookType.DEMAND,
    period: '2025',
    median: null,
    currency: null,
    payPeriod: null,
    grossOrNet: null,
    experienceLevel: null,
    demandLevel: Demand.HIGH,
    ...overrides,
  });

const careerRow = (
  overrides: Partial<CareerComparisonRow> = {},
): CareerComparisonRow => ({
  id: 'career-a',
  slug: 'backend-engineer',
  title: 'Backend Engineer',
  description: 'Builds server-side applications.',
  roleSummary: 'Designs and maintains APIs.',
  exampleActivities: ['Design REST APIs'],
  imageUrl: 'https://example.com/banner.png',
  iconKey: 'backend',
  targetLevels: [TargetLevel.RECENT_GRAD],
  typicalEducationNote: 'Degree in computing or equivalent.',
  field: {
    id: 'field-1',
    name: 'Software Engineering',
    slug: 'software-engineering',
  },
  _count: { resources: 4 },
  skills: [
    {
      importance: SkillImportance.REQUIRED,
      skill: { id: 'skill-ts', name: 'TypeScript' },
    },
  ],
  pathway: {
    steps: [
      { id: 'step-1', title: 'Programming fundamentals', order: 1 },
      { id: 'step-2', title: 'Databases', order: 2 },
    ],
    _count: { stages: 2 },
  },
  outlook: [outlookRow({}), demandRow()],
  ...overrides,
});

const findKeys = (value: unknown, pattern: RegExp): string[] => {
  if (value === null || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => [
    ...(pattern.test(key) ? [key] : []),
    ...findKeys(child, pattern),
  ]);
};

describe('CareerComparisonService', () => {
  const service = new CareerComparisonService();

  describe('buildComparison', () => {
    it('maps both careers in the order given', () => {
      const result = service.buildComparison(
        careerRow(),
        careerRow({ id: 'career-b', title: 'Data Analyst' }),
      );

      expect(result.careers.map(({ id }) => id)).toEqual([
        'career-a',
        'career-b',
      ]);
      expect(result.careers[0]).toEqual({
        id: 'career-a',
        slug: 'backend-engineer',
        title: 'Backend Engineer',
        description: 'Builds server-side applications.',
        iconKey: 'backend',
        field: {
          id: 'field-1',
          name: 'Software Engineering',
          slug: 'software-engineering',
        },
        roleSummary: 'Designs and maintains APIs.',
        exampleActivities: ['Design REST APIs'],
        targetLevels: [TargetLevel.RECENT_GRAD],
        typicalEducationNote: 'Degree in computing or equivalent.',
        skills: [
          {
            id: 'skill-ts',
            name: 'TypeScript',
            importance: SkillImportance.REQUIRED,
          },
        ],
        salary: {
          geography: 'Lagos, Nigeria',
          period: 'Q2 2025',
          experienceLevel: 'entry-level',
          median: '4500000',
          percentile25: null,
          percentile75: null,
          currency: 'NGN',
          payPeriod: 'year',
          grossOrNet: 'gross',
          source: {
            name: 'Local salary survey',
            url: 'https://example.com/salaries',
          },
        },
        demand: {
          geography: 'Lagos, Nigeria',
          period: '2025',
          demandLevel: Demand.HIGH,
          source: {
            name: 'Local salary survey',
            url: 'https://example.com/salaries',
          },
        },
        pathway: {
          stepCount: 2,
          stageCount: 2,
          firstStep: { id: 'step-1', title: 'Programming fundamentals' },
        },
      });
    });

    it('picks the entry-level salary over an earlier salary entry', () => {
      const career = careerRow({
        outlook: [
          outlookRow({
            id: 'us-salary',
            geography: 'United States',
            currency: 'USD',
            experienceLevel: 'all experience levels',
          }),
          outlookRow({ id: 'lagos-salary' }),
        ],
      });

      const [compared] = service.buildComparison(career, career).careers;

      expect(compared.salary?.geography).toBe('Lagos, Nigeria');
    });

    it('falls back to the earliest salary entry without an entry-level one', () => {
      const career = careerRow({
        outlook: [
          outlookRow({
            id: 'us-salary',
            geography: 'United States',
            experienceLevel: 'all experience levels',
          }),
          outlookRow({
            id: 'uk-salary',
            geography: 'United Kingdom',
            experienceLevel: null,
          }),
        ],
      });

      const [compared] = service.buildComparison(career, career).careers;

      expect(compared.salary?.geography).toBe('United States');
    });

    it('returns null salary, demand and source when the data is missing', () => {
      const withoutOutlook = careerRow({ outlook: [] });
      const withoutSource = careerRow({
        outlook: [outlookRow({ sourceId: null, source: null })],
      });

      const [empty, unsourced] = service.buildComparison(
        withoutOutlook,
        withoutSource,
      ).careers;

      expect(empty.salary).toBeNull();
      expect(empty.demand).toBeNull();
      expect(unsourced.salary?.source).toBeNull();
    });

    it('returns a null pathway, or a null first step for an empty pathway', () => {
      const [noPathway, noSteps] = service.buildComparison(
        careerRow({ pathway: null }),
        careerRow({ pathway: { steps: [], _count: { stages: 0 } } }),
      ).careers;

      expect(noPathway.pathway).toBeNull();
      expect(noSteps.pathway).toEqual({
        stepCount: 0,
        stageCount: 0,
        firstStep: null,
      });
    });

    it('flags matching salary and demand as comparable', () => {
      const { outlook } = service.buildComparison(careerRow(), careerRow());

      expect(outlook).toEqual({
        salary: { comparable: true, reasons: [] },
        demand: { comparable: true, reasons: [] },
      });
    });

    it.each([
      ['GEOGRAPHY', { geography: 'United States' }],
      ['PERIOD', { period: 'May 2024' }],
      ['CURRENCY', { currency: 'USD' }],
      ['PAY_PERIOD', { payPeriod: 'month' }],
    ] as const)(
      'flags salaries with a different %s as not comparable',
      (reason, change) => {
        const { outlook } = service.buildComparison(
          careerRow(),
          careerRow({ outlook: [outlookRow(change)] }),
        );

        expect(outlook.salary).toEqual({
          comparable: false,
          reasons: [reason],
        });
      },
    );

    it.each([
      ['GEOGRAPHY', { geography: 'United States' }],
      ['PERIOD', { period: '2024' }],
    ] as const)(
      'flags demand with a different %s as not comparable',
      (reason, change) => {
        const { outlook } = service.buildComparison(
          careerRow(),
          careerRow({ outlook: [demandRow(change)] }),
        );

        expect(outlook.demand).toEqual({
          comparable: false,
          reasons: [reason],
        });
      },
    );

    it('lists every mismatch on a salary', () => {
      const { outlook } = service.buildComparison(
        careerRow(),
        careerRow({
          outlook: [
            outlookRow({
              geography: 'United States',
              period: 'May 2024',
              currency: 'USD',
            }),
          ],
        }),
      );

      expect(outlook.salary.reasons).toEqual([
        'GEOGRAPHY',
        'PERIOD',
        'CURRENCY',
      ]);
    });

    it('flags a value missing on either side as not comparable', () => {
      const { outlook } = service.buildComparison(
        careerRow(),
        careerRow({ outlook: [] }),
      );

      expect(outlook).toEqual({
        salary: { comparable: false, reasons: ['MISSING_VALUE'] },
        demand: { comparable: false, reasons: ['MISSING_VALUE'] },
      });
    });

    it('returns no percentage fields', () => {
      const career = careerRow({
        outlook: [
          outlookRow({}),
          outlookRow({
            id: 'growth-1',
            type: OutlookType.EMPLOYMENT_GROWTH,
            growthPercent: new Prisma.Decimal('8'),
          }),
          demandRow(),
        ],
      });

      const result = service.buildComparison(career, career);

      expect(findKeys(result, /percent(?!ile)/i)).toEqual([]);
    });
  });

  describe('computeSkillMatch', () => {
    const skill = (id: string, importance: SkillImportance) => ({
      id,
      name: id,
      importance,
    });

    const career = {
      skills: [
        skill('ts', SkillImportance.REQUIRED),
        skill('sql', SkillImportance.REQUIRED),
        skill('nest', SkillImportance.REQUIRED),
        skill('docker', SkillImportance.NICE_TO_HAVE),
        skill('graphql', SkillImportance.NICE_TO_HAVE),
      ],
    };

    it('counts only required skills and lists nice-to-have ones', () => {
      expect(
        service.computeSkillMatch(career, ['ts', 'sql', 'docker']),
      ).toEqual({
        matchedRequiredSkills: [
          { id: 'ts', name: 'ts' },
          { id: 'sql', name: 'sql' },
        ],
        requiredSkillCount: 3,
        percentage: 67,
        niceToHaveSkills: [
          { id: 'docker', name: 'docker', matched: true },
          { id: 'graphql', name: 'graphql', matched: false },
        ],
      });
    });

    it('returns 100 when every required skill is listed', () => {
      expect(
        service.computeSkillMatch(career, ['ts', 'sql', 'nest']).percentage,
      ).toBe(100);
    });

    it('returns 0 for a user with no skills', () => {
      const result = service.computeSkillMatch(career, []);

      expect(result.matchedRequiredSkills).toEqual([]);
      expect(result.percentage).toBe(0);
      expect(result.niceToHaveSkills.every(({ matched }) => !matched)).toBe(
        true,
      );
    });

    it('returns no percentage for a career with no required skills', () => {
      const result = service.computeSkillMatch(
        { skills: [skill('docker', SkillImportance.NICE_TO_HAVE)] },
        ['docker'],
      );

      expect(result).toEqual({
        matchedRequiredSkills: [],
        requiredSkillCount: 0,
        percentage: null,
        niceToHaveSkills: [{ id: 'docker', name: 'docker', matched: true }],
      });
    });
  });
});
