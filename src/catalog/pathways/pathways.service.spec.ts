import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PrismaService } from '../../prisma';
import { CareerStatus } from '../../generated/prisma/client';
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
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    career: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathway: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      upsert: jest.fn<(args: unknown) => Promise<unknown>>(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathwayStep: {
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      createMany: jest.fn<(args: unknown) => Promise<unknown>>(),
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
    capturesInsideTransaction = 0;

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

  describe('getPathwayMetadata', () => {
    it('returns pathway metadata with slim ordered steps and stepCount', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        id: 'p1',
        careerId: 'c1',
        title: 'Frontend Path',
        description: 'Learn the frontend',
        steps: [
          { id: 's1', title: 'HTML', order: 1, description: 'Basics' },
          { id: 's2', title: 'CSS', order: 2, description: null },
        ],
      });

      const result = await service.getPathwayMetadata('p1');

      expect(result).toEqual({
        id: 'p1',
        careerId: 'c1',
        title: 'Frontend Path',
        description: 'Learn the frontend',
        stepCount: 2,
        steps: [
          { id: 's1', title: 'HTML', order: 1, description: 'Basics' },
          { id: 's2', title: 'CSS', order: 2, description: null },
        ],
      });
    });

    it('filters by pathway id and PUBLISHED career', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        id: 'p1',
        careerId: 'c1',
        title: 't',
        description: null,
        steps: [],
      });

      await service.getPathwayMetadata('p1');

      expect(mockPrismaService.pathway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'p1',
            career: { status: CareerStatus.PUBLISHED },
          },
        }),
      );
    });

    it('returns empty steps and stepCount 0 for a pathway with no steps', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        id: 'p1',
        careerId: 'c1',
        title: 'Empty',
        description: null,
        steps: [],
      });

      const result = await service.getPathwayMetadata('p1');

      expect(result.steps).toEqual([]);
      expect(result.stepCount).toBe(0);
    });

    it('does not leak resources, skills, or full step detail', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        id: 'p1',
        careerId: 'c1',
        title: 't',
        description: null,
        steps: [{ id: 's1', title: 'HTML', order: 1, description: null }],
      });

      const result = await service.getPathwayMetadata('p1');

      expect(Object.keys(result).sort()).toEqual(
        ['careerId', 'description', 'id', 'stepCount', 'steps', 'title'].sort(),
      );
      expect(Object.keys(result.steps[0]).sort()).toEqual(
        ['description', 'id', 'order', 'title'].sort(),
      );
    });

    it('throws NotFoundException when the pathway is missing or its career is not PUBLISHED', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(service.getPathwayMetadata('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

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
