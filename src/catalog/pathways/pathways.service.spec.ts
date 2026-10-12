import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PrismaService } from '../../prisma';
import { CareerStatus } from '../../generated/prisma/client';

describe('PathwaysService', () => {
  let service: PathwaysService;

  const mockPrisma = {
    pathway: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwaysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PathwaysService>(PathwaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPathwayMetadata', () => {
    it('returns pathway metadata with slim ordered steps and stepCount', async () => {
      mockPrisma.pathway.findFirst.mockResolvedValue({
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
      mockPrisma.pathway.findFirst.mockResolvedValue({
        id: 'p1',
        careerId: 'c1',
        title: 't',
        description: null,
        _count: { steps: 0 },
        steps: [],
      });

      await service.getPathwayMetadata('p1');

      expect(mockPrisma.pathway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'p1',
            career: { status: CareerStatus.PUBLISHED },
          },
        }),
      );
    });

    it('returns empty steps and stepCount 0 for a pathway with no steps', async () => {
      mockPrisma.pathway.findFirst.mockResolvedValue({
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
      mockPrisma.pathway.findFirst.mockResolvedValue({
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
      mockPrisma.pathway.findFirst.mockResolvedValue(null);

      await expect(service.getPathwayMetadata('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
