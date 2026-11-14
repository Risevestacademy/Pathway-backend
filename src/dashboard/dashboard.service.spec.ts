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

  const pathwayRead = (nextStepId: string | null) => ({
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
    stages: [],
  });

  const activePathwayWithNextStep = (nextStepId: string | null) => {
    mockPrismaService.userPathway.findFirst.mockResolvedValue(savedPathwayRow);
    mockPathwaysService.getPathwayRead.mockResolvedValue(
      pathwayRead(nextStepId),
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

  describe('totals', () => {
    it('gives a new user zeros and empty lists, never nulls', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.totals).toEqual({
        savedPathways: 0,
        completedSteps: 0,
        xp: 0,
        badgesEarned: 0,
        badgesTotal: 4,
      });
      expect(dashboard.streak).toEqual({ current: 0, longest: 0 });
      expect(dashboard.badges).toEqual([]);
      expect(dashboard.todaysGoals).toEqual({
        step: null,
        tasks: [],
        resources: [],
      });
    });

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

    it('counts completed steps across every pathway', async () => {
      mockPrismaService.userPathwayStep.count.mockResolvedValue(16);

      const dashboard = await service.getDashboard(userId);

      expect(mockPrismaService.userPathwayStep.count).toHaveBeenCalledWith({
        where: { userId, status: PathwayStepStatus.COMPLETED },
      });
      expect(dashboard.totals.completedSteps).toBe(16);
    });

    it('sums XP from the whole ledger, whatever its type', async () => {
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
    it('counts consecutive days of step completions', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue(
        stepCompletedOn('2026-11-12', '2026-11-13', '2026-11-14'),
      );

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.streak).toEqual({ current: 3, longest: 3 });
    });

    it('reads the streak and the heatmap from the same days', async () => {
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

    it('takes the UTC day from the column itself, not the session timezone', async () => {
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
  });

  describe("today's goals", () => {
    it('is empty when the user has no active pathway', async () => {
      await service.getDashboard(userId);

      expect(mockPrismaService.pathwayStep.findUnique).not.toHaveBeenCalled();
    });

    it('is empty when the active pathway is finished', async () => {
      activePathwayWithNextStep(null);

      const dashboard = await service.getDashboard(userId);

      expect(mockPrismaService.pathwayStep.findUnique).not.toHaveBeenCalled();
      expect(dashboard.todaysGoals.step).toBeNull();
    });

    it('asks only for active resources, in a stable order', async () => {
      activePathwayWithNextStep('step-2');

      await service.getDashboard(userId);

      const [args] = mockPrismaService.pathwayStep.findUnique.mock.calls[0] as [
        {
          select: {
            resources: {
              where: { resource: { status: ResourceStatus } };
              orderBy: { resource: { title: string } };
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
    });

    it('returns the next step with its tasks and resources', async () => {
      activePathwayWithNextStep('step-2');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue({
        id: 'step-2',
        title: 'Semantic HTML',
        order: 2,
        tasks: [
          {
            id: 'task-1',
            title: 'Build a page',
            goal: 'Practise structure',
            estimatedWeeks: 1,
            whatToMake: ['A page'],
            hints: ['Start small'],
            checklistItems: [{ text: 'Headings' }, { text: 'Landmarks' }],
          },
        ],
        resources: [
          {
            resource: {
              id: 'resource-1',
              title: 'HTML guide',
              url: 'https://example.com',
              type: 'ARTICLE',
              costStatus: 'FREE',
              estimatedWeeks: null,
              provider: 'Example',
            },
          },
        ],
      });

      const { todaysGoals } = await service.getDashboard(userId);

      expect(todaysGoals.step).toEqual({
        id: 'step-2',
        title: 'Semantic HTML',
        order: 2,
      });
      expect(todaysGoals.tasks).toEqual([
        {
          id: 'task-1',
          title: 'Build a page',
          goal: 'Practise structure',
          estimatedWeeks: 1,
          whatToMake: ['A page'],
          hints: ['Start small'],
          checklist: ['Headings', 'Landmarks'],
        },
      ]);
      expect(todaysGoals.resources).toEqual([
        {
          id: 'resource-1',
          title: 'HTML guide',
          url: 'https://example.com',
          type: 'ARTICLE',
          costStatus: 'FREE',
          estimatedWeeks: null,
          provider: 'Example',
        },
      ]);
    });

    it('gives each caller its own empty goals', async () => {
      const first = await service.getDashboard(userId);
      first.todaysGoals.tasks.push({} as never);

      const second = await service.getDashboard(userId);

      expect(second.todaysGoals.tasks).toEqual([]);
    });

    it('is empty when the next step no longer exists', async () => {
      activePathwayWithNextStep('step-gone');
      mockPrismaService.pathwayStep.findUnique.mockResolvedValue(null);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.todaysGoals).toEqual({
        step: null,
        tasks: [],
        resources: [],
      });
    });
  });

  describe('active pathway', () => {
    it('is null when no pathway is active', async () => {
      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activePathway).toBeNull();
      expect(mockPathwaysService.getPathwayRead).not.toHaveBeenCalled();
    });

    it('reads progress and the next step from the stage-aware pathway read', async () => {
      activePathwayWithNextStep('step-2');

      const dashboard = await service.getDashboard(userId);

      expect(mockPathwaysService.getPathwayRead).toHaveBeenCalledWith(
        'pathway-1',
        userId,
      );
      expect(dashboard.activePathway).toEqual({
        pathwayId: 'pathway-1',
        career: pathwayRead('step-2').career,
        progress: pathwayRead('step-2').progress,
      });
    });

    it("takes today's goals from the same next step the pathway read reports", async () => {
      activePathwayWithNextStep('step-2');

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activePathway?.progress?.nextStepId).toBe('step-2');
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
  });
});
