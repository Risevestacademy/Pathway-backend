import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersService } from './careers.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CareerStatus,
  TargetLevel,
  OutlookType,
  Demand,
} from '../../generated/prisma/client';
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
      targetLevels: [TargetLevel.RECENT_GRAD],
      status: CareerStatus.PUBLISHED,
      publishedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),

      field: {
        name: 'Software Engineering',
        slug: 'software-engineering',
      },

      skills: [
        {
          skill: {
            id: 'skill-1',
            name: 'TypeScript',
          },
        },
      ],

      outlook: [
        {
          id: 'outlook-1',
          type: OutlookType.SALARY,
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
          demandLevel: null as Demand | null,
          updatedAt: new Date('2026-01-02'),
        },
      ],

      pathway: {
        id: 'pathway-1',
        title: 'Backend Roadmap',
        _count: {
          steps: 3,
        },
      },
    };

    it('should return the published career with field, skills, outlook and pathway summary', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      const result = await service.getPublishedCareerById('career-1');

      expect(result).toEqual({
        id: 'career-1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
        roleSummary: 'Designs and builds software systems.',
        exampleActivities: ['Write code', 'Review PRs'],
        typicalEducationNote: null,
        certificationsNote: null,
        targetLevels: [TargetLevel.RECENT_GRAD],
        status: CareerStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),

        field: {
          name: 'Software Engineering',
          slug: 'software-engineering',
        },

        skills: [
          {
            id: 'skill-1',
            name: 'TypeScript',
          },
        ],

        outlook: [
          expect.objectContaining({
            id: 'outlook-1',
            type: OutlookType.SALARY,
            median: '65000.00',
          }),
        ],

        pathway: {
          id: 'pathway-1',
          title: 'Backend Roadmap',
          stepCount: 3,
        },
      });
    });

    it('should query only the career fields and relationship data required by the detail response', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      await service.getPublishedCareerById('career-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'career-1',
          status: CareerStatus.PUBLISHED,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          roleSummary: true,
          exampleActivities: true,
          typicalEducationNote: true,
          certificationsNote: true,
          targetLevels: true,
          status: true,
          publishedAt: true,
          updatedAt: true,

          field: {
            select: {
              name: true,
              slug: true,
            },
          },

          skills: {
            select: {
              skill: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          outlook: {
            select: {
              id: true,
              type: true,
              geography: true,
              source: true,
              sourceUrl: true,
              period: true,
              median: true,
              percentile25: true,
              percentile75: true,
              currency: true,
              payPeriod: true,
              grossOrNet: true,
              experienceLevel: true,
              baseYear: true,
              baseValue: true,
              projectedYear: true,
              projectedValue: true,
              growthPercent: true,
              demandLevel: true,
              updatedAt: true,
            },
          },

          pathway: {
            select: {
              id: true,
              title: true,
              _count: {
                select: {
                  steps: true,
                },
              },
            },
          },
        },
      });
    });

    it('should return a pathway summary without loading pathway steps', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      const result = await service.getPublishedCareerById('career-1');

      expect(result.pathway).toEqual({
        id: 'pathway-1',
        title: 'Backend Roadmap',
        stepCount: 3,
      });

      expect(result.pathway).not.toHaveProperty('steps');
      expect(result.pathway).not.toHaveProperty('resources');
    });

    it('should return null pathway when the career has no pathway', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({
        ...mockDbCareer,
        pathway: null,
      });

      const result = await service.getPublishedCareerById('career-1');

      expect(result.pathway).toBeNull();
    });

    it('should throw NotFoundException when the career does not exist', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('missing-career'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the career is not published', async () => {
      // Because the query filters by PUBLISHED status, Prisma returns null
      // for DRAFT and RETIRED careers.
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('draft-career'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.getPublishedCareerById('retired-career'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
