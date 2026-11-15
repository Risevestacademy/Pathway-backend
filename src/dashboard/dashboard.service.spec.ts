import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PathwaysService } from '../catalog/pathways';
import {
  CareerStatus,
  PathwayStepStatus,
  ResourceStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { DashboardService } from './dashboard.service';

type DayRow = { date: string; count: number };

describe('DashboardService', () => {
  let service: DashboardService;

  const now = new Date('2026-11-14T08:00:00.000Z');
  const userId = 'user-1';

  const mockPrismaService = {
    userPathway: {
      count: jest.fn<(args: unknown) => Promise<number>>(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathwayStep: { count: jest.fn<(args: unknown) => Promise<number>>() },
    badge: { count: jest.fn<() => Promise<number>>() },
    userBadge: { findMany: jest.fn<(args: unknown) => Promise<unknown[]>>() },
    activityLedger: {
      aggregate:
        jest.fn<(args: unknown) => Promise<{ _sum: { xp: number | null } }>>(),
    },
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<DayRow[]>>(),
    pathwayStep: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  const mockPathwaysService = {
    getPathwayRead:
      jest.fn<(pathwayId: string, userId: string | null) => Promise<unknown>>(),
  };

  const savedPathwayRow = {
    career: { pathway: { id: 'pathway-1' } },
  };

  const stage = (
    overrides: Partial<{
      id: string;
      title: string;
      description: string | null;
      order: number;
      steps: Array<{
        id: string;
        title: string;
        order: number;
        status: PathwayStepStatus | null;
        skills: string[];
      }>;
    }> = {},
  ) => ({
    id: 'stage-1',
    title: 'Foundations',
    description: 'The basics',
    order: 1,
    steps: [
      {
        id: 'step-1',
        title: 'HTML',
        order: 1,
        status: PathwayStepStatus.COMPLETED,
        skills: ['HTML', 'CSS'],
      },
      {
        id: 'step-2',
        title: 'CSS',
        order: 2,
        status: PathwayStepStatus.NOT_STARTED,
        skills: ['CSS', 'Layout'],
      },
    ],
    ...overrides,
  });

  const pathwayRead = (nextStepId: string | null, stages: unknown[] = []) => ({
    id: 'pathway-1',
    career: {
      id: 'career-1',
      title: 'C',
      description: null,
      retired: false,
      stageCount: 2,
      stepCount: 3,
      resourceCount: 1,
    },
    progress: {
      completed: 1,
      total: 3,
      percentage: 33,
      nextStepId,
      selfReported: true,
    },
    stages,
  });

  const activePathwayWith = (
    nextStepId: string | null,
    stages: unknown[] = [],
  ) => {
    mockPrismaService.userPathway.findFirst.mockResolvedValue(savedPathwayRow);
    mockPathwaysService.getPathwayRead.mockResolvedValue(
      pathwayRead(nextStepId, stages),
    );
  };

  const stepCompletedOn = (...days: string[]): DayRow[] =>
    days.map((date) => ({ date, count: 1 }));

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PathwaysService, useValue: mockPathwaysService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);

    mockPrismaService.userPathway.count.mockResolvedValue(0);
    mockPrismaService.userPathwayStep.count.mockResolvedValue(0);
    mockPrismaService.badge.count.mockResolvedValue(4);
    mockPrismaService.userBadge.findMany.mockResolvedValue([]);
    mockPrismaService.activityLedger.aggregate.mockResolvedValue({
      _sum: { xp: null },
    });
    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.pathwayStep.findUnique.mockResolvedValue(null);
    mockPrismaService.userPathway.findFirst.mockResolvedValue(null);
    mockPathwaysService.getPathwayRead.mockResolvedValue(pathwayRead(null));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('new user', () => {
    it('returns every field present, with zeros and empty lists', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.totals).toEqual({
        savedPathways: 0,
        completedSteps: 0,
        xp: 0,
        badgesEarned: 0,
        badgesTotal: 4,
      });
      expect(dashboard.streak).toEqual({ current: 0, longest: 0 });
      expect(dashboard.weekStrip.days).toHaveLength(7);
      expect(dashboard.weekStrip.days.every((d) => !d.active)).toBe(true);
      expect(dashboard.weekStrip.currentStreak).toBe(0);
      expect(dashboard.heatmap.days).toHaveLength(365);
      expect(dashboard.badges).toEqual([]);
      expect(dashboard.activePathway).toBeNull();
      expect(dashboard.currentProject).toBeNull();
      expect(dashboard.goals).toEqual([]);
    });
  });

  describe('totals', () => {
    it('counts only saved pathways whose career is still visible', async () => {
      await service.getDashboard(userId);

      expect(mockPrismaService.userPathway.count).toHaveBeenCalledWith({
        where: {
          userId,
          career: {
            status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
          },
        },
      });
    });

    it('reports the global completed-step count, not the pathway one', async () => {
      activePathwayWith('step-2');
      mockPrismaService.userPathwayStep.count.mockResolvedValue(16);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.totals.completedSteps).toBe(16);
      expect(dashboard.activePathway?.progress.completed).toBe(1);
      expect(dashboard.totals.completedSteps).not.toBe(
        dashboard.activePathway?.progress.completed,
      );
    });

    it('sums XP from the whole ledger', async () => {
      mockPrismaService.activityLedger.aggregate.mockResolvedValue({
        _sum: { xp: 150 },
      });

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.totals.xp).toBe(150);
    });

    it('reports earned badges against the catalogue total', async () => {
      const awardedAt = new Date('2026-11-10T10:00:00.000Z');
      mockPrismaService.userBadge.findMany.mockResolvedValue([
        {
          awardedAt,
          badge: {
            id: 'badge-1',
            name: 'First step',
            description: 'Completed a step',
            iconKey: 'leaf',
            xpThreshold: 50,
          },
        },
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.totals.badgesEarned).toBe(1);
      expect(dashboard.totals.badgesTotal).toBe(4);
      expect(dashboard.badges).toEqual([
        {
          id: 'badge-1',
          name: 'First step',
          description: 'Completed a step',
          iconKey: 'leaf',
          xpThreshold: 50,
          awardedAt,
        },
      ]);
    });
  });

  describe('streak and heatmap', () => {
    it('counts consecutive days of activity', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue(
        stepCompletedOn('2026-11-12', '2026-11-13', '2026-11-14'),
      );

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.streak).toEqual({ current: 3, longest: 3 });
    });

    it('reads the streak and the heatmap from the same activity rows', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { date: '2026-11-13', count: 2 },
        { date: '2026-11-14', count: 1 },
      ]);

      const dashboard = await service.getDashboard(userId, 7);

      expect(dashboard.streak).toEqual({ current: 2, longest: 2 });
      expect(dashboard.heatmap.days).toContainEqual({
        date: '2026-11-13',
        count: 2,
      });
    });

    it('takes the UTC day from the column, not the session timezone', async () => {
      await service.getDashboard(userId);

      const [fragments] = mockPrismaService.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
      ];
      const sql = fragments.join('');

      expect(sql).toContain('"createdAt"::date');
      expect(sql).not.toContain('AT TIME ZONE');
    });

    it('spans the requested window, ending today', async () => {
      const dashboard = await service.getDashboard(userId, 7);

      expect(dashboard.heatmap.from).toBe('2026-11-08');
      expect(dashboard.heatmap.to).toBe('2026-11-14');
      expect(dashboard.heatmap.days).toHaveLength(7);
    });

    it('defaults to a year', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.heatmap.days).toHaveLength(365);
    });

    it('keeps activity older than the window out of the heatmap but in the longest streak', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue(
        stepCompletedOn('2026-11-01', '2026-11-02', '2026-11-03'),
      );

      const dashboard = await service.getDashboard(userId, 7);

      expect(dashboard.heatmap.days.every(({ count }) => count === 0)).toBe(
        true,
      );
      expect(dashboard.streak.longest).toBe(3);
    });

    it('queries the ledger across every tracked activity type', async () => {
      await service.getDashboard(userId);

      const [, ...params] = mockPrismaService.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      // The tracked types are passed as one array parameter.
      const types = params.find((p) => Array.isArray(p)) as string[];

      expect(types).toEqual(
        expect.arrayContaining([
          'STEP_COMPLETED',
          'TASK_COMPLETED',
          'QUIZ_PASSED',
          'RESOURCE_COMPLETED',
        ]),
      );
    });
  });

  describe('weekStrip', () => {
    it('shares the current streak with the streak summary', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue(
        stepCompletedOn('2026-11-13', '2026-11-14'),
      );

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.weekStrip.currentStreak).toBe(dashboard.streak.current);
    });

    it('marks a day active when the ledger has activity that day', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { date: '2026-11-10', count: 1 },
      ]);

      const dashboard = await service.getDashboard(userId);

      const active = dashboard.weekStrip.days.filter((d) => d.active);
      expect(active.map((d) => d.date)).toEqual(['2026-11-10']);
    });
  });

  describe('goals', () => {
    it('is empty when the active pathway is finished', async () => {
      activePathwayWith(null);

      const dashboard = await service.getDashboard(userId);

      expect(mockPrismaService.pathwayStep.findUnique).not.toHaveBeenCalled();
      expect(dashboard.goals).toEqual([]);
    });

    it('is empty when the user has no active pathway', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(mockPrismaService.pathwayStep.findUnique).not.toHaveBeenCalled();
      expect(dashboard.goals).toEqual([]);
    });

    it('asks only for active resources, ordered by resource title', async () => {
      activePathwayWith('step-2');

      await service.getDashboard(userId);

      const [args] = mockPrismaService.pathwayStep.findUnique.mock.calls[0] as [
        {
          select: {
            resources: {
              where: { resource: { status: ResourceStatus } };
              orderBy: { resource: { title: string } };
              take: number;
            };
          };
        },
      ];

      expect(args.select.resources.where).toEqual({
        resource: { status: ResourceStatus.ACTIVE },
      });
      expect(args.select.resources.orderBy).toEqual({
        resource: { title: 'asc' },
      });
      expect(args.select.resources.take).toBe(1);
    });

    it('builds the goals in STEP, TASK, CHECKLIST, RESOURCE order', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.NOT_STARTED }],
        tasks: [
          {
            id: 'task-1',
            title: 'Build a page',
            goal: 'Practise structure',
            completions: [],
            checklistItems: [
              { id: 'check-1', text: 'Headings', userChecks: [] },
              {
                id: 'check-2',
                text: 'Landmarks',
                userChecks: [{ checkedAt: now }],
              },
            ],
          },
        ],
        resources: [
          {
            resource: {
              id: 'resource-1',
              title: 'HTML guide',
              url: 'https://example.com',
              completions: [],
            },
          },
        ],
      });

      const { goals } = await service.getDashboard(userId);

      expect(goals.map((g) => g.kind)).toEqual([
        'STEP',
        'TASK',
        'CHECKLIST',
        'CHECKLIST',
        'RESOURCE',
      ]);
    });

    it('carries the right XP per goal kind', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.NOT_STARTED }],
        tasks: [
          {
            id: 'task-1',
            title: 'Build a page',
            goal: 'Practise structure',
            completions: [],
            checklistItems: [
              { id: 'check-1', text: 'Headings', userChecks: [] },
            ],
          },
        ],
        resources: [
          {
            resource: {
              id: 'resource-1',
              title: 'HTML guide',
              url: 'https://example.com',
              completions: [],
            },
          },
        ],
      });

      const { goals } = await service.getDashboard(userId);

      const xp = (kind: string) =>
        goals.find((g) => g.kind === kind)?.xp ?? null;

      expect(xp('STEP')).toBe(50);
      expect(xp('TASK')).toBe(30);
      expect(xp('CHECKLIST')).toBeNull();
      expect(xp('RESOURCE')).toBe(10);
    });

    it('marks a goal done when the caller has completed it', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.COMPLETED }],
        tasks: [
          {
            id: 'task-1',
            title: 'Build a page',
            goal: 'Practise structure',
            completions: [{ completedAt: now }],
            checklistItems: [
              {
                id: 'check-1',
                text: 'Headings',
                userChecks: [{ checkedAt: now }],
              },
            ],
          },
        ],
        resources: [
          {
            resource: {
              id: 'resource-1',
              title: 'HTML guide',
              url: 'https://example.com',
              completions: [{ completedAt: now }],
            },
          },
        ],
      });

      const { goals } = await service.getDashboard(userId);

      expect(goals.every((g) => g.done)).toBe(true);
    });

    it('uses task.goal, parent task title, and resource.url as goalDescription', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.NOT_STARTED }],
        tasks: [
          {
            id: 'task-1',
            title: 'Build a page',
            goal: 'Practise structure',
            completions: [],
            checklistItems: [
              { id: 'check-1', text: 'Headings', userChecks: [] },
            ],
          },
        ],
        resources: [
          {
            resource: {
              id: 'resource-1',
              title: 'HTML guide',
              url: 'https://example.com',
              completions: [],
            },
          },
        ],
      });

      const { goals } = await service.getDashboard(userId);

      expect(goals.find((g) => g.kind === 'STEP')?.goalDescription).toBeNull();
      expect(goals.find((g) => g.kind === 'TASK')?.goalDescription).toBe(
        'Practise structure',
      );
      expect(goals.find((g) => g.kind === 'CHECKLIST')?.goalDescription).toBe(
        'Build a page',
      );
      expect(goals.find((g) => g.kind === 'RESOURCE')?.goalDescription).toBe(
        'https://example.com',
      );
    });

    it('omits the RESOURCE goal when the step has no active resources', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.NOT_STARTED }],
        tasks: [],
        resources: [],
      });

      const { goals } = await service.getDashboard(userId);

      expect(goals.map((g) => g.kind)).toEqual(['STEP']);
    });

    it('returns a fresh goals array on each call', async () => {
      activePathwayWith('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        progress: [{ status: PathwayStepStatus.NOT_STARTED }],
        tasks: [],
        resources: [],
      });

      const first = await service.getDashboard(userId);
      first.goals.push({} as never);

      const second = await service.getDashboard(userId);

      expect(second.goals).toHaveLength(1);
    });

    it('returns an empty array when the next step no longer exists', async () => {
      activePathwayWith('step-gone');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue(null);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.goals).toEqual([]);
    });
  });

  describe('active pathway', () => {
    it('is null when no pathway is active', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activePathway).toBeNull();
      expect(mockPathwaysService.getPathwayRead).not.toHaveBeenCalled();
    });

    it('reads progress and the next step from the stage-aware pathway read', async () => {
      activePathwayWith('step-2');

      const dashboard = await service.getDashboard(userId);

      expect(mockPathwaysService.getPathwayRead).toHaveBeenCalledWith(
        'pathway-1',
        userId,
      );
      expect(dashboard.activePathway).toEqual({
        pathwayId: 'pathway-1',
        career: {
          id: 'career-1',
          title: 'C',
          description: null,
          retired: false,
        },
        progress: {
          completed: 1,
          total: 3,
          percentage: 33,
          nextStepId: 'step-2',
          selfReported: true,
        },
      });
    });

    it('takes goals from the same next step the pathway read reports', async () => {
      activePathwayWith('step-2');

      await service.getDashboard(userId);

      expect(mockPrismaService.pathwayStep.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'step-2' } }),
      );
    });

    it('ignores an active pathway whose career is no longer visible', async () => {
      await service.getDashboard(userId);

      const [args] = mockPrismaService.userPathway.findFirst.mock.calls[0] as [
        { where: { career: { status: { in: CareerStatus[] } } } },
      ];

      expect(args.where.career.status.in).toEqual([
        CareerStatus.PUBLISHED,
        CareerStatus.RETIRED,
      ]);
    });

    it('treats a pathway read without progress as no active pathway', async () => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue(
        savedPathwayRow,
      );
      mockPathwaysService.getPathwayRead.mockResolvedValue({
        ...pathwayRead(null),
        progress: null,
      });

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activePathway).toBeNull();
      expect(dashboard.currentProject).toBeNull();
    });
  });

  describe('currentProject', () => {
    it('is null when the user has no active pathway', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject).toBeNull();
    });

    it('is null when every stage is complete', async () => {
      activePathwayWith('step-2', [
        stage({
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.COMPLETED,
              skills: ['HTML'],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject).toBeNull();
    });

    it('picks the first stage with an incomplete step', async () => {
      activePathwayWith('step-2', [
        stage({
          id: 'stage-1',
          title: 'Foundations',
          order: 1,
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.COMPLETED,
              skills: ['HTML'],
            },
          ],
        }),
        stage({
          id: 'stage-2',
          title: 'Intermediate',
          description: 'Next up',
          order: 2,
          steps: [
            {
              id: 'step-2',
              title: 'CSS',
              order: 1,
              status: PathwayStepStatus.NOT_STARTED,
              skills: ['CSS', 'Layout'],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject).toMatchObject({
        stageId: 'stage-2',
        stageTitle: 'Intermediate',
        stageDescription: 'Next up',
        stageOrder: 2,
      });
    });

    it('reports the stage percentage from completed / total', async () => {
      activePathwayWith('step-2', [
        stage({
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.COMPLETED,
              skills: [],
            },
            {
              id: 'step-2',
              title: 'CSS',
              order: 2,
              status: PathwayStepStatus.NOT_STARTED,
              skills: [],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject).toMatchObject({
        completed: 1,
        total: 2,
        percentage: 50,
      });
    });

    it('lists the stage steps with their per-step status, in order', async () => {
      activePathwayWith('step-2', [
        stage({
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.COMPLETED,
              skills: [],
            },
            {
              id: 'step-2',
              title: 'CSS',
              order: 2,
              status: PathwayStepStatus.NOT_STARTED,
              skills: [],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject?.steps).toEqual([
        {
          id: 'step-1',
          title: 'HTML',
          order: 1,
          status: PathwayStepStatus.COMPLETED,
        },
        {
          id: 'step-2',
          title: 'CSS',
          order: 2,
          status: PathwayStepStatus.NOT_STARTED,
        },
      ]);
    });

    it('dedupes skills across the stage steps, preserving first-seen order', async () => {
      activePathwayWith('step-2', [
        stage({
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.NOT_STARTED,
              skills: ['HTML', 'CSS'],
            },
            {
              id: 'step-2',
              title: 'CSS',
              order: 2,
              status: PathwayStepStatus.NOT_STARTED,
              skills: ['CSS', 'Layout'],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject?.skills).toEqual([
        'HTML',
        'CSS',
        'Layout',
      ]);
    });

    it('returns an empty skills array when the stage steps have no skills', async () => {
      activePathwayWith('step-2', [
        stage({
          steps: [
            {
              id: 'step-1',
              title: 'HTML',
              order: 1,
              status: PathwayStepStatus.NOT_STARTED,
              skills: [],
            },
          ],
        }),
      ]);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.currentProject?.skills).toEqual([]);
    });

    it('does not query the database for the current project', async () => {
      activePathwayWith('step-2', [stage()]);

      await service.getDashboard(userId);

      // pathwayStep.findUnique is only for the goals query; there is no
      // separate stage or step query for currentProject.
      expect(mockPrismaService.pathwayStep.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
