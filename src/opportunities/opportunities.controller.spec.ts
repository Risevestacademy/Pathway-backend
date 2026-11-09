import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../common';
import { OpportunityType } from '../generated/prisma/client';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import type { OpportunityDetailDto } from './dto/opportunity-detail.dto';
import type { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import type { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

describe('OpportunitiesController', () => {
  let controller: OpportunitiesController;

  const mockOpportunitiesService = {
    listOpportunities:
      jest.fn<
        (query: GetOpportunitiesQueryDto) => Promise<OpportunityListItemDto[]>
      >(),
    getOpportunityById:
      jest.fn<(id: string) => Promise<OpportunityDetailDto>>(),
    saveOpportunity:
      jest.fn<
        (
          userId: string,
          opportunityId: string,
        ) => Promise<SaveOpportunityResponseDto>
      >(),
    unsaveOpportunity:
      jest.fn<(userId: string, opportunityId: string) => Promise<void>>(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpportunitiesController],
      providers: [
        { provide: OpportunitiesService, useValue: mockOpportunitiesService },
      ],
    }).compile();

    controller = module.get<OpportunitiesController>(OpportunitiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listOpportunities', () => {
    it('passes the query to the service and returns its result', async () => {
      const query: GetOpportunitiesQueryDto = {
        type: OpportunityType.JOB,
        page: 1,
        limit: 20,
      };
      const items: OpportunityListItemDto[] = [];
      mockOpportunitiesService.listOpportunities.mockResolvedValue(items);

      const result = await controller.listOpportunities(query);

      expect(mockOpportunitiesService.listOpportunities).toHaveBeenCalledWith(
        query,
      );
      expect(result).toBe(items);
    });
  });

  describe('getOpportunityById', () => {
    it('should delegate the id to opportunitiesService.getOpportunityById', async () => {
      const detail = { id: 'opp-1', status: 'CLOSED' } as OpportunityDetailDto;
      mockOpportunitiesService.getOpportunityById.mockResolvedValue(detail);

      const result = await controller.getOpportunityById('opp-1');

      expect(mockOpportunitiesService.getOpportunityById).toHaveBeenCalledWith(
        'opp-1',
      );
      expect(result).toBe(detail);
    });
  });

  describe('saveOpportunity', () => {
    it('should save the opportunity for the authenticated user', async () => {
      const saved: SaveOpportunityResponseDto = {
        opportunityId: 'opportunity-1',
        savedAt: new Date('2026-11-06T12:00:00.000Z'),
      };
      mockOpportunitiesService.saveOpportunity.mockResolvedValue(saved);

      const result = await controller.saveOpportunity(user, 'opportunity-1');

      expect(mockOpportunitiesService.saveOpportunity).toHaveBeenCalledWith(
        'user-1',
        'opportunity-1',
      );
      expect(result).toEqual(saved);
    });
  });

  describe('unsaveOpportunity', () => {
    it('should unsave the opportunity for the authenticated user', async () => {
      mockOpportunitiesService.unsaveOpportunity.mockResolvedValue(undefined);

      await controller.unsaveOpportunity(user, 'opportunity-1');

      expect(mockOpportunitiesService.unsaveOpportunity).toHaveBeenCalledWith(
        'user-1',
        'opportunity-1',
      );
    });
  });
});
