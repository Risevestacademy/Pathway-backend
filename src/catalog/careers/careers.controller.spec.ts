import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import {
  CareerStatus,
  Demand,
  OutlookType,
  TargetLevel,
} from '../../generated/prisma/client';
import { CareerDetailDto } from './dto/career-detail.dto';
import { CareerListItemDto } from './dto/list-careers.dto';
import { CareerPathwayResponseDto } from './dto/career-pathway.dto';

describe('CareersController', () => {
  let controller: CareersController;

  const mockCareersService = {
    getPublicCareers: jest.fn<() => Promise<CareerListItemDto[]>>(),
    getPublishedCareerById: jest.fn<(id: string) => Promise<CareerDetailDto>>(),
    getCareerPathway:
      jest.fn<(id: string) => Promise<CareerPathwayResponseDto>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CareersController],
      providers: [
        {
          provide: CareersService,
          useValue: mockCareersService,
        },
      ],
    }).compile();

    controller = module.get<CareersController>(CareersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCareers', () => {
    it('should delegate query params to careersService.getPublicCareers', async () => {
      const mockResult: CareerListItemDto[] = [
        {
          id: 'career-1',
          slug: 'software-engineer',
          title: 'Software Engineer',
          shortDescription: 'Builds software applications.',
        },
      ];

      mockCareersService.getPublicCareers.mockResolvedValue(mockResult);

      const query: GetCareersQueryDto = {
        level: TargetLevel.EARLY_CAREER,
        interest: 'software-engineering',
      };

      const result = await controller.getCareers(query);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledTimes(1);
      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should delegate an empty query to careersService.getPublicCareers', async () => {
      const mockResult: CareerListItemDto[] = [];

      mockCareersService.getPublicCareers.mockResolvedValue(mockResult);

      const query: GetCareersQueryDto = {};

      const result = await controller.getCareers(query);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledTimes(1);
      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getCareerById', () => {
    it('should delegate the career id to careersService.getPublishedCareerById', async () => {
      const mockResult: CareerDetailDto = {
        id: 'career-1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
        roleSummary: 'Designs and builds software systems.',
        exampleActivities: ['Write code', 'Review PRs'],
        typicalEducationNote: null,
        certificationsNote: null,
        field: {
          name: 'Software Engineering',
          slug: 'software-engineering',
        },
        targetLevels: [TargetLevel.EARLY_CAREER],
        status: CareerStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        skills: [
          {
            id: 'skill-1',
            name: 'TypeScript',
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
            median: '65000.00',
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
          stepCount: 3,
        },
      };

      mockCareersService.getPublishedCareerById.mockResolvedValue(mockResult);

      const result = await controller.getCareerById('career-1');

      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledTimes(
        1,
      );
      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        'career-1',
      );
      expect(result).toEqual(mockResult);
    });

    it('should return a career with a null pathway when the service returns one', async () => {
      const mockResult = {
        id: 'career-1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
        roleSummary: 'Designs and builds software systems.',
        exampleActivities: ['Write code'],
        typicalEducationNote: null,
        certificationsNote: null,
        field: {
          name: 'Software Engineering',
          slug: 'software-engineering',
        },
        targetLevels: [TargetLevel.EARLY_CAREER],
        status: CareerStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        skills: [],
        outlook: [],
        pathway: null,
      } satisfies CareerDetailDto;

      mockCareersService.getPublishedCareerById.mockResolvedValue(mockResult);

      const result = await controller.getCareerById('career-1');

      expect(result.pathway).toBeNull();
      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        'career-1',
      );
    });
  });

  describe('getCareerPathway', () => {
    it('delegates to careersService.getCareerPathway', async () => {
      const mockResult = {
        pathway: { id: 'pathway-1', steps: [] },
      } as unknown as CareerPathwayResponseDto;
      mockCareersService.getCareerPathway.mockResolvedValue(mockResult);

      const result = await controller.getCareerPathway('career-1');

      expect(mockCareersService.getCareerPathway).toHaveBeenCalledWith(
        'career-1',
      );
      expect(result).toEqual(mockResult);
    });

    it('returns { pathway: null } when the career has no pathway', async () => {
      mockCareersService.getCareerPathway.mockResolvedValue({ pathway: null });

      const result = await controller.getCareerPathway('career-1');

      expect(result).toEqual({ pathway: null });
    });
  });
});
