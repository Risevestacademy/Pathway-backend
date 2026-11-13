import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PrismaService } from '../../prisma';
import { CareerStatus, PathwayStepStatus } from '../../generated/prisma/client';
import { AnalyticsService } from '../../analytics';

describe('PathwaysService', () => {
  let service: PathwaysService;

  const mockAnalyticsService = {
    capture:
      jest.fn<
        (event: string, distinctId: string, properties?: unknown) => void
      >(),
  };

  let capturesInsideTransaction = 0;

  const mockPrismaService = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    pathway: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(), // RESTORED: used by setActivePathway
    },
    career: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    pathwayStep: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathway: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      upsert: jest.fn<(args: unknown) => Promise<unknown>>(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathwayStep: {
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => {
      const before = mockAnalyticsService.capture.mock.calls.length;
      const result = await callback(mockPrismaService);
      capturesInsideTransaction +=
        mockAnalyticsService.capture.mock.calls.length - before;
      return result;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    capturesInsideTransaction = 0; // RESTORED

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwaysService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<PathwaysService>(PathwaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────
  // T9.3: New Pathway Read
  // ───────────────────────────────────────────────────────────────────

  describe('getPathwayRead', () => {
    const baseDbRow = {
      id: 'p1',
      _count: { steps: 2, stages: 1 },
      career: {
        id: 'c1',
        title: 'Frontend Path',
        description: 'Learn frontend',
        status: CareerStatus.PUBLISHED,
        _count: { resources: 12 },
      },
      stages: [
        {
          id: 'st1',
          title: 'Foundations',
          description: 'Basics',
          order: 1,
          quiz: { id: 'q1', attempts: [] },
          steps: [
            {
              id: 's1',
              title: 'HTML',
              order: 1,
              description: 'Markup',
              learningObjective: 'Read HTML',
              expectedActivity: 'Write a page',
              skills: [{ skill: { name: 'HTML' } }],
            },
            {
              id: 's2',
              title: 'CSS',
              order: 2,
              description: 'Styles',
              learningObjective: 'Read CSS',
              expectedActivity: 'Style page',
              skills: [{ skill: { name: 'CSS' } }],
            },
          ],
        },
      ],
    };

    // Heavy data that query 2 returns for a step id.
    const heavyS1 = {
      id: 's1',
      resources: [
        {
          resource: {
            id: 'r1',
            title: 'MDN',
            url: 'http...',
            type: 'ARTICLE',
            costStatus: 'FREE',
            estimatedWeeks: null,
            provider: 'MDN',
          },
        },
      ],
      tasks: [
        {
          id: 't1',
          title: 'Build a form',
          goal: 'Submit data',
          estimatedWeeks: 1,
          whatToMake: ['Form'],
          hints: [],
          checklistItems: [{ text: 'Input' }],
        },
      ],
    };

    const heavyS2 = {
      id: 's2',
      resources: [
        {
          resource: {
            id: 'r2',
            title: 'CSS Tricks',
            url: 'http...',
            type: 'ARTICLE',
            costStatus: 'FREE',
            estimatedWeeks: null,
            provider: 'CSS Tricks',
          },
        },
      ],
      tasks: [],
    };

    // Query 2 returns only the step ids it was asked for.
    beforeEach(() => {
      mockPrismaService.pathwayStep.findMany.mockImplementation(
        async (args: unknown) => {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return [heavyS1, heavyS2].filter((h) => ids.includes(h.id));
        },
      );
    });

    const heavyIdsRequested = (): string[] =>
      (
        mockPrismaService.pathwayStep.findMany.mock.calls[0][0] as {
          where: { id: { in: string[] } };
        }
      ).where.id.in;

    it('filters by pathway id and PUBLISHED or RETIRED careers only', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(baseDbRow);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);

      await service.getPathwayRead('p1', null);

      expect(mockPrismaService.pathway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'p1',
            career: {
              status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
            },
          },
        }),
      );
    });

    it('throws NotFoundException when the pathway is missing or a draft', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(service.getPathwayRead('missing', null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('anonymous: no progress or statuses, heavy data only for the first step', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(baseDbRow);

      const result = await service.getPathwayRead('p1', null);

      expect(result.progress).toBeNull();
      expect(result.stages[0].progress).toBeNull();
      expect(result.stages[0].steps[0].status).toBeNull();

      expect(heavyIdsRequested()).toEqual(['s1']);
      expect(result.stages[0].steps[0].resources).toHaveLength(1);
      expect(result.stages[0].steps[0].resources[0].title).toBe('MDN');
      expect(result.stages[0].steps[0].tasks).toHaveLength(1);

      expect(result.stages[0].steps[1].resources).toEqual([]);
      expect(result.stages[0].steps[1].tasks).toEqual([]);
    });

    it('signed-in: progress, and heavy data for the NEXT incomplete step', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(baseDbRow);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
        { pathwayStepId: 's1', status: PathwayStepStatus.COMPLETED },
      ]);
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: null,
      });

      const result = await service.getPathwayRead('p1', 'u1');

      expect(result.progress?.completed).toBe(1);
      expect(result.progress?.nextStepId).toBe('s2');
      expect(heavyIdsRequested()).toEqual(['s2']);

      expect(result.stages[0].steps[0].resources).toEqual([]);
      expect(result.stages[0].steps[1].resources[0].title).toBe('CSS Tricks');
    });

    it('start step that is also the next step: heavy data is requested once', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(baseDbRow);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: 's2',
      });

      const result = await service.getPathwayRead('p1', 'u1');

      expect(result.progress?.nextStepId).toBe('s2');
      expect(heavyIdsRequested()).toEqual(['s2']);
      expect(result.stages[0].steps[0].resources).toEqual([]);
      expect(result.stages[0].steps[1].resources).toHaveLength(1);
    });

    it('start step with work left after it: next step is the start step, and heavy data goes to both', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(baseDbRow);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
        { pathwayStepId: 's2', status: PathwayStepStatus.COMPLETED },
      ]);
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: 's2',
      });

      const result = await service.getPathwayRead('p1', 'u1');

      // s2 is complete and nothing after it is left, so next falls back to s1.
      expect(result.progress?.nextStepId).toBe('s1');
      expect(heavyIdsRequested().sort()).toEqual(['s1', 's2']);
      expect(result.stages[0].steps[0].resources).toHaveLength(1);
      expect(result.stages[0].steps[1].resources).toHaveLength(1);
    });

    it('quiz status: NOT_TAKEN with no attempt, TAKEN with a score after one', async () => {
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: null,
      });
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);

      mockPrismaService.pathway.findFirst.mockResolvedValueOnce(baseDbRow);
      const notTaken = await service.getPathwayRead('p1', 'u1');
      expect(notTaken.stages[0].quiz).toEqual({ status: 'NOT_TAKEN' });

      mockPrismaService.pathway.findFirst.mockResolvedValueOnce({
        ...baseDbRow,
        stages: [
          {
            ...baseDbRow.stages[0],
            quiz: {
              id: 'q1',
              attempts: [{ correct: 2, total: 3 }],
            },
          },
        ],
      });
      const taken = await service.getPathwayRead('p1', 'u1');
      expect(taken.stages[0].quiz).toEqual({
        status: 'TAKEN',
        score: { correct: 2, total: 3 },
      });
    });

    it('career header: stage count, step count, resource count and retired flag', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        ...baseDbRow,
        career: { ...baseDbRow.career, status: CareerStatus.RETIRED },
      });

      const result = await service.getPathwayRead('p1', null);

      expect(result.career).toEqual({
        id: 'c1',
        title: 'Frontend Path',
        description: 'Learn frontend',
        retired: true,
        stageCount: 1,
        stepCount: 2,
        resourceCount: 12,
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // T9.2-era test suites (unchanged)
  // ───────────────────────────────────────────────────────────────────
  describe('setActivePathway', () => {
    it('throws NotFoundException for a draft, retired, or unknown career', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);
      await expect(
        service.setActivePathway('user-1', 'career-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the published career has no pathway', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({ id: 'career-1' });
      mockPrismaService.pathway.findUnique.mockResolvedValue(null);
      await expect(
        service.setActivePathway('user-1', 'career-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('locks the user, then deactivates other pathways before upserting the new active one, in one transaction', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({ id: 'career-1' });
      mockPrismaService.pathway.findUnique.mockResolvedValue({
        id: 'pathway-1',
      });
      mockPrismaService.userPathway.findFirst.mockResolvedValue(null);

      await service.setActivePathway('user-1', 'career-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(
        mockPrismaService.$queryRaw.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockPrismaService.userPathway.updateMany.mock.invocationCallOrder[0],
      );
      expect(mockPrismaService.userPathway.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isActive: true,
          careerId: { not: 'career-1' },
        },
        data: { isActive: false },
      });
      expect(mockPrismaService.userPathway.upsert).toHaveBeenCalledWith({
        where: { userId_careerId: { userId: 'user-1', careerId: 'career-1' } },
        create: { userId: 'user-1', careerId: 'career-1', isActive: true },
        update: { isActive: true },
      });
    });

    describe('pathway_saved event', () => {
      beforeEach(() => {
        mockPrismaService.career.findFirst.mockResolvedValue({
          id: 'career-1',
        });
        mockPrismaService.pathway.findUnique.mockResolvedValue({
          id: 'pathway-1',
        });
        mockPrismaService.userPathway.findFirst.mockResolvedValue(null);
      });

      afterEach(() => {
        expect(capturesInsideTransaction).toBe(0);
      });

      it.each([
        ['a first save', { count: 0 }],
        ['a switch from another pathway', { count: 1 }],
      ])(
        'emits pathway_saved with the careerId on %s',
        async (_label, deactivated) => {
          mockPrismaService.userPathway.updateMany.mockResolvedValue(
            deactivated,
          );

          await service.setActivePathway('user-1', 'career-1');

          expect(mockAnalyticsService.capture.mock.calls).toEqual([
            ['pathway_saved', 'user-1', { careerId: 'career-1' }],
          ]);
        },
      );

      it('emits after the transaction and before the active pathway read', async () => {
        await service.setActivePathway('user-1', 'career-1');

        const [captureOrder] =
          mockAnalyticsService.capture.mock.invocationCallOrder;

        expect(
          mockPrismaService.userPathway.upsert.mock.invocationCallOrder[0],
        ).toBeLessThan(captureOrder);
        expect(captureOrder).toBeLessThan(
          mockPrismaService.userPathway.findFirst.mock.invocationCallOrder[0],
        );
      });

      it('leaves the response unchanged', async () => {
        await expect(
          service.setActivePathway('user-1', 'career-1'),
        ).resolves.toEqual(await service.getActivePathway('user-1'));
      });

      it('emits nothing when the career is not found or not published', async () => {
        mockPrismaService.career.findFirst.mockResolvedValue(null);

        await expect(
          service.setActivePathway('user-1', 'career-1'),
        ).rejects.toThrow(NotFoundException);

        expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
      });

      it('emits nothing when the career has no pathway', async () => {
        mockPrismaService.pathway.findUnique.mockResolvedValue(null);

        await expect(
          service.setActivePathway('user-1', 'career-1'),
        ).rejects.toThrow(ConflictException);

        expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
      });
    });
  });

  describe('setStartingPoint', () => {
    beforeEach(() => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue({
        id: 'up-1',
        career: { pathway: { id: 'pathway-1' } },
      });
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue({
        id: 'step-2',
      });
      mockPrismaService.userPathway.update.mockResolvedValue({});
      mockPrismaService.pathwayStep.findMany.mockResolvedValue([
        { id: 'step-1', order: 1 },
        { id: 'step-2', order: 2 },
      ]);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);
    });

    it("looks up the user's saved pathway for a PUBLISHED or RETIRED career", async () => {
      await service.setStartingPoint('user-1', 'career-1', 'step-2');

      expect(mockPrismaService.userPathway.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          careerId: 'career-1',
          career: {
            status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
          },
        },
        select: {
          id: true,
          career: { select: { pathway: { select: { id: true } } } },
        },
      });
    });

    it('throws NotFoundException and writes nothing when the career is not saved', async () => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue(null);

      await expect(
        service.setStartingPoint('user-1', 'career-1', 'step-2'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.userPathway.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the saved career has no pathway', async () => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue({
        id: 'up-1',
        career: { pathway: null },
      });

      await expect(
        service.setStartingPoint('user-1', 'career-1', 'step-2'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.userPathway.update).not.toHaveBeenCalled();
    });

    it("only accepts a step from the career's own pathway", async () => {
      await service.setStartingPoint('user-1', 'career-1', 'step-2');

      expect(mockPrismaService.pathwayStep.findFirst).toHaveBeenCalledWith({
        where: { id: 'step-2', pathwayId: 'pathway-1' },
        select: { id: true },
      });
    });

    it('throws BadRequestException and writes nothing for a step outside the pathway', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue(null);

      await expect(
        service.setStartingPoint('user-1', 'career-1', 'other-step'),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.userPathway.update).not.toHaveBeenCalled();
    });

    it('stores only startStepId and returns progress that starts from it', async () => {
      const result = await service.setStartingPoint(
        'user-1',
        'career-1',
        'step-2',
      );

      expect(mockPrismaService.userPathway.update).toHaveBeenCalledWith({
        where: { id: 'up-1' },
        data: { startStepId: 'step-2' },
      });
      expect(result).toEqual({
        careerId: 'career-1',
        startStepId: 'step-2',
        progress: {
          completed: 0,
          total: 2,
          percentage: 0,
          nextStepId: 'step-2',
          selfReported: true,
          startStepId: 'step-2',
        },
      });
    });

    it('clears the starting point with null, without a step lookup', async () => {
      const result = await service.setStartingPoint('user-1', 'career-1', null);

      expect(mockPrismaService.pathwayStep.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.userPathway.update).toHaveBeenCalledWith({
        where: { id: 'up-1' },
        data: { startStepId: null },
      });
      expect(result.progress).toMatchObject({
        nextStepId: 'step-1',
        startStepId: null,
      });
    });
  });

  describe('getActivePathway', () => {
    it('returns the null-shaped body when there is no active pathway', async () => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue(null);
      const result = await service.getActivePathway('user-1');
      expect(result).toEqual({
        career: null,
        pathway: null,
        progress: null,
        steps: [],
      });
    });

    it('marks a RETIRED career as retired: true', async () => {
      mockPrismaService.userPathway.findFirst.mockResolvedValue({
        career: {
          id: 'c1',
          slug: 's',
          title: 't',
          roleSummary: 'r',
          status: 'RETIRED',
          pathway: { id: 'p1', title: 'pt', steps: [] },
        },
      });
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);
      const result = await service.getActivePathway('user-1');
      expect(result.career?.retired).toBe(true);
    });

    describe('progress with a starting point', () => {
      const activeRow = (startStepId: string | null) => ({
        startStepId,
        career: {
          id: 'c1',
          slug: 's',
          title: 't',
          roleSummary: 'r',
          status: CareerStatus.PUBLISHED,
          pathway: {
            id: 'p1',
            title: 'pt',
            steps: [
              { id: 'step-1', order: 1, title: 'One', skills: [] },
              { id: 'step-2', order: 2, title: 'Two', skills: [] },
              { id: 'step-3', order: 3, title: 'Three', skills: [] },
            ],
          },
        },
      });

      beforeEach(() => {
        mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
          { pathwayStepId: 'step-3', status: 'COMPLETED' },
        ]);
      });

      it('selects the stored startStepId', async () => {
        mockPrismaService.userPathway.findFirst.mockResolvedValue(
          activeRow(null),
        );

        await service.getActivePathway('user-1');

        expect(mockPrismaService.userPathway.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            select: expect.objectContaining({ startStepId: true }),
          }),
        );
      });

      it('exposes startStepId and picks nextStepId from the starting point', async () => {
        mockPrismaService.userPathway.findFirst.mockResolvedValue(
          activeRow('step-2'),
        );

        const result = await service.getActivePathway('user-1');

        expect(result.progress).toEqual({
          completed: 1,
          total: 3,
          percentage: 33,
          nextStepId: 'step-2',
          selfReported: true,
          startStepId: 'step-2',
        });
      });

      it('exposes a null startStepId and the earliest incomplete step without one', async () => {
        mockPrismaService.userPathway.findFirst.mockResolvedValue(
          activeRow(null),
        );

        const result = await service.getActivePathway('user-1');

        expect(result.progress).toMatchObject({
          nextStepId: 'step-1',
          startStepId: null,
        });
      });
    });
  });

  describe('getSavedPathways', () => {
    it('returns each saved visible pathway with its progress and active flag', async () => {
      mockPrismaService.userPathway.findMany.mockResolvedValue([
        {
          isActive: true,
          career: {
            id: 'c1',
            slug: 's1',
            title: 't1',
            status: CareerStatus.PUBLISHED,
            pathway: {
              steps: [
                { id: 'step-1', order: 1 },
                { id: 'step-2', order: 2 },
              ],
            },
          },
        },
        {
          isActive: false,
          career: {
            id: 'c2',
            slug: 's2',
            title: 't2',
            status: CareerStatus.RETIRED,
            pathway: { steps: [{ id: 'step-3', order: 1 }] },
          },
        },
      ]);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
        { pathwayStepId: 'step-1', status: 'COMPLETED' },
        { pathwayStepId: 'step-3', status: 'COMPLETED' },
      ]);

      const result = await service.getSavedPathways('user-1');

      expect(result).toEqual([
        {
          career: { id: 'c1', slug: 's1', title: 't1', retired: false },
          isActive: true,
          progress: { completed: 1, total: 2, percentage: 50 },
        },
        {
          career: { id: 'c2', slug: 's2', title: 't2', retired: true },
          isActive: false,
          progress: { completed: 1, total: 1, percentage: 100 },
        },
      ]);
    });

    it('filters out a saved career with no pathway', async () => {
      mockPrismaService.userPathway.findMany.mockResolvedValue([
        {
          isActive: false,
          career: {
            id: 'c1',
            slug: 's1',
            title: 't1',
            status: CareerStatus.PUBLISHED,
            pathway: null,
          },
        },
      ]);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);

      const result = await service.getSavedPathways('user-1');

      expect(result).toEqual([]);
    });

    it('queries pathways and user steps exactly once each, regardless of saved count', async () => {
      mockPrismaService.userPathway.findMany.mockResolvedValue([]);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);

      await service.getSavedPathways('user-1');

      expect(mockPrismaService.userPathway.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.userPathwayStep.findMany).toHaveBeenCalledTimes(
        1,
      );
    });

    it('selects startStepId and reports the same totals as the active pathway read', async () => {
      const steps = [
        { id: 'step-1', order: 1 },
        { id: 'step-2', order: 2 },
      ];
      const userSteps = [{ pathwayStepId: 'step-1', status: 'COMPLETED' }];

      mockPrismaService.userPathway.findMany.mockResolvedValue([
        {
          isActive: true,
          startStepId: 'step-2',
          career: {
            id: 'c1',
            slug: 's1',
            title: 't1',
            status: CareerStatus.PUBLISHED,
            pathway: { steps },
          },
        },
      ]);
      mockPrismaService.userPathway.findFirst.mockResolvedValue({
        startStepId: 'step-2',
        career: {
          id: 'c1',
          slug: 's1',
          title: 't1',
          roleSummary: 'r',
          status: CareerStatus.PUBLISHED,
          pathway: {
            id: 'p1',
            title: 'pt',
            steps: steps.map((s) => ({ ...s, title: s.id, skills: [] })),
          },
        },
      });
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue(userSteps);

      const [saved] = await service.getSavedPathways('user-1');
      const active = await service.getActivePathway('user-1');

      expect(mockPrismaService.userPathway.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ startStepId: true }),
        }),
      );
      expect(saved.progress).toEqual({
        completed: active.progress!.completed,
        total: active.progress!.total,
        percentage: active.progress!.percentage,
      });
    });

    it('only requests PUBLISHED or RETIRED careers', async () => {
      mockPrismaService.userPathway.findMany.mockResolvedValue([]);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);

      await service.getSavedPathways('user-1');

      expect(mockPrismaService.userPathway.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            career: {
              status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
            },
          },
        }),
      );
    });
  });
});
