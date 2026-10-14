import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PrismaService } from '../../prisma';
import { CareerStatus } from '../../generated/prisma/client';

describe('PathwaysService', () => {
  let service: PathwaysService;

  const mockPrismaService = {
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
    },
    userPathwayStep: {
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(mockPrismaService),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwaysService,
        { provide: PrismaService, useValue: mockPrismaService },
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
        _count: { steps: 2 },
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
        _count: { steps: 0 },
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
        _count: { steps: 0 },
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
        _count: { steps: 1 },
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

    it('deactivates other pathways before upserting the new active one, in one transaction', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({ id: 'career-1' });
      mockPrismaService.pathway.findUnique.mockResolvedValue({
        id: 'pathway-1',
      });
      mockPrismaService.userPathway.findFirst.mockResolvedValue(null);

      await service.setActivePathway('user-1', 'career-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
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
  });
});
