import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersService } from './careers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CareerStatus, TargetLevel } from '../../generated/prisma/client';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { NotFoundException } from '@nestjs/common';

describe('CareersService', () => {
  let service: CareersService;

  const mockPrismaService = {
    career: {
      findMany: jest.fn<
        () => Promise<
          {
            id: string;
            slug: string;
            title: string;
            description: string;
          }[]
        >
      >(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CareersService>(CareersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicCareers', () => {
    const mockDbCareers = [
      {
        id: '1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
      },
    ];

    it('should return mapped public careers without query filters', async () => {
      mockPrismaService.career.findMany.mockResolvedValue(mockDbCareers);

      const result = await service.getPublicCareers({});

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: {
          status: CareerStatus.PUBLISHED,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });

      expect(result).toEqual([
        {
          id: '1',
          slug: 'software-engineer',
          title: 'Software Engineer',
          shortDescription: 'Builds software applications.',
        },
      ]);
    });

    it('should apply level and interest filters correctly to where clause', async () => {
      mockPrismaService.career.findMany.mockResolvedValue(mockDbCareers);

      // Ensure 'level' is passed explicitly
      const query: GetCareersQueryDto = {
        level: TargetLevel.RECENT_GRAD,
        interest: 'software-engineering',
      };

      await service.getPublicCareers(query);

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: {
          status: CareerStatus.PUBLISHED,
          targetLevels: { has: TargetLevel.RECENT_GRAD },
          field: { slug: 'software-engineering' },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });
    });
  });

  describe('getPublishedCareerById', () => {
    const mockDbCareer = {
      id: 'career-1',
      slug: 'software-engineer',
      title: 'Software Engineer',
      description: 'Builds software applications.',
      roleSummary: 'Designs and builds software systems.',
      exampleActivities: ['Write code', 'Review PRs'],
      typicalEducationNote: null,
      certificationsNote: null,
      targetLevels: ['RECENT_GRAD'],
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      field: { name: 'Software Engineering', slug: 'software-engineering' },
      skills: [{ skill: { id: 'skill-1', name: 'TypeScript' } }],
      outlook: [
        {
          id: 'outlook-1',
          type: 'SALARY',
          geography: 'United States',
          source: 'Example Labour Stats',
          sourceUrl: null,
          period: '2026',
          median: { toString: () => '65000.00' },
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
          updatedAt: new Date('2026-01-02'),
        },
      ],
      pathway: {
        id: 'pathway-1',
        title: 'Backend Roadmap',
        _count: { steps: 3 },
      },
    };

    it('returns a published career with mapped outlook, skills and pathway', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      const result = await service.getPublishedCareerById('career-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'career-1', status: CareerStatus.PUBLISHED },
        }),
      );
      expect(result.skills).toEqual([{ id: 'skill-1', name: 'TypeScript' }]);
      expect(result.outlook[0].median).toBe('65000.00');
      expect(result.pathway).toEqual({
        id: 'pathway-1',
        title: 'Backend Roadmap',
        stepCount: 3,
      });
    });

    it('returns null pathway when the career has none', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({
        ...mockDbCareer,
        pathway: null,
      });

      const result = await service.getPublishedCareerById('career-1');

      expect(result.pathway).toBeNull();
    });

    // The where clause filters by status: PUBLISHED, so a DRAFT or RETIRED
    // career causes findFirst to return null, the same as a nonexistent one.
    it('throws NotFoundException for a DRAFT career', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('draft-career'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a RETIRED career', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('retired-career'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a nonexistent career', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('missing-career'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
