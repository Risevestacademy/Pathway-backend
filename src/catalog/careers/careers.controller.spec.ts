import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { CareerStatus, TargetLevel } from '../../generated/prisma/client';
import { SaveCareerResponseDto } from './dto/save-career-response.dto';
import type { AuthenticatedUser } from '../../common';
import { CareerPathwayResponseDto } from './pathways/dto/career-pathway.dto';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';
import { PathwaysService } from './pathways/pathways.service';
import type { CareerListResponseDto } from './dto/career-list-response.dto';
import type { CareerDetailResponseDto } from './dto/career-detail-response.dto';
import type { CareerCardDto } from './dto/career-card.dto';

describe('CareersController', () => {
  let controller: CareersController;

  const mockCareersService = {
    getPublicCareers: jest.fn<() => Promise<CareerListResponseDto>>(),
    getPublishedCareerById:
      jest.fn<(id: string) => Promise<CareerDetailResponseDto>>(),
    saveCareer:
      jest.fn<
        (userId: string, careerId: string) => Promise<SaveCareerResponseDto>
      >(),
    unsaveCareer:
      jest.fn<(userId: string, careerId: string) => Promise<void>>(),
  };

  const mockPathwaysService = {
    getCareerPathway:
      jest.fn<(id: string) => Promise<CareerPathwayResponseDto>>(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  const card: CareerCardDto = {
    id: 'career-1',
    slug: 'software-engineer',
    title: 'Software Engineer',
    description: 'Builds software applications.',
    iconKey: 'se-icon',
    targetLevels: [TargetLevel.EARLY_CAREER],
    topicCount: 3,
    resourceCount: 12,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CareersController],
      providers: [
        { provide: CareersService, useValue: mockCareersService },
        { provide: PathwaysService, useValue: mockPathwaysService },
      ],
    }).compile();

    controller = module.get<CareersController>(CareersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCareers', () => {
    it('delegates the query to getPublicCareers and returns the envelope', async () => {
      const mockResult: CareerListResponseDto = {
        totals: { pathways: 7, topics: 57, resources: 141 },
        items: [card],
      };
      mockCareersService.getPublicCareers.mockResolvedValue(mockResult);

      const query: GetCareersQueryDto = {
        level: TargetLevel.EARLY_CAREER,
        interest: 'software-engineering',
      };

      const result = await controller.getCareers(query);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('delegates an empty query', async () => {
      mockCareersService.getPublicCareers.mockResolvedValue({
        totals: { pathways: 0, topics: 0, resources: 0 },
        items: [],
      });

      const result = await controller.getCareers({});

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith({});
      expect(result.items).toEqual([]);
    });
  });

  describe('getCareerById', () => {
    it('delegates the id and returns { overview, projection, requirements }', async () => {
      const mockResult: CareerDetailResponseDto = {
        overview: {
          title: 'Software Engineer',
          description: 'Builds software applications.',
          roleSummary: 'Designs and builds software systems.',
          exampleActivities: ['Write code'],
          imageUrl: 'https://cdn/banner.png',
          skills: [
            { id: 'skill-1', name: 'TypeScript', importance: 'REQUIRED' },
          ],
          topicCount: 3,
          resourceCount: 12,
        },
        projection: [],
        requirements: { courses: [], certifications: [] },
      };
      mockCareersService.getPublishedCareerById.mockResolvedValue(mockResult);

      const result = await controller.getCareerById('career-1');

      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        'career-1',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getCareerPathway', () => {
    it('delegates the id to pathwaysService', async () => {
      const mockResult: CareerPathwayResponseDto = {
        pathway: {
          id: 'pathway-1',
          careerId: 'career-1',
          title: 'Backend Roadmap',
          description: 'From fundamentals to production APIs.',
          steps: [],
        },
      };
      mockPathwaysService.getCareerPathway.mockResolvedValue(mockResult);

      const result = await controller.getCareerPathway('career-1');

      expect(mockPathwaysService.getCareerPathway).toHaveBeenCalledWith(
        'career-1',
      );
      expect(result).toEqual(mockResult);
    });

    it('returns { pathway: null } when there is no pathway', async () => {
      mockPathwaysService.getCareerPathway.mockResolvedValue({ pathway: null });

      const result = await controller.getCareerPathway('career-1');

      expect(result).toEqual({ pathway: null });
    });
  });

  describe('saveCareer', () => {
    it('passes the user and career ids through', async () => {
      const saved = { careerId: 'career-1', savedAt: new Date() };
      mockCareersService.saveCareer.mockResolvedValue(saved);

      const result = await controller.saveCareer(user, 'career-1');

      expect(mockCareersService.saveCareer).toHaveBeenCalledWith(
        'user-1',
        'career-1',
      );
      expect(result).toEqual(saved);
    });
  });

  describe('unsaveCareer', () => {
    it('passes the user and career ids through', async () => {
      mockCareersService.unsaveCareer.mockResolvedValue(undefined);

      await controller.unsaveCareer(user, 'career-1');

      expect(mockCareersService.unsaveCareer).toHaveBeenCalledWith(
        'user-1',
        'career-1',
      );
    });
  });
});
