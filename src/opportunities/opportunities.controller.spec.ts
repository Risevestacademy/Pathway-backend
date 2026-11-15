import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException, type AuthenticatedUser } from '../common';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import type { OpportunityDetailDto } from './dto/opportunity-detail.dto';
import type { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import type { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { Role } from '../generated/prisma/enums';

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
      const query = { page: 1, limit: 20 } as GetOpportunitiesQueryDto;
      const result = [] as OpportunityListItemDto[];
      mockOpportunitiesService.listOpportunities.mockResolvedValue(result);

      await expect(
        controller.listOpportunities(undefined, query),
      ).resolves.toBe(result);
      expect(mockOpportunitiesService.listOpportunities).toHaveBeenCalledWith(
        query,
        undefined,
      );
    });

    it('rejects saved=true without a signed-in user', async () => {
      const query = {
        page: 1,
        limit: 20,
        saved: true,
      } as GetOpportunitiesQueryDto;

      const error = await controller
        .listOpportunities(undefined, query)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({ code: 'SAVED_FILTER_REQUIRES_AUTH' });
      expect((error as DomainException).getStatus()).toBe(400);
      expect(mockOpportunitiesService.listOpportunities).not.toHaveBeenCalled();
    });

    it('forwards the caller id when signed in', async () => {
      const query = { page: 1, limit: 20 } as GetOpportunitiesQueryDto;
      const user = { id: 'user-1', email: 'dev@example.com', role: Role.USER };
      mockOpportunitiesService.listOpportunities.mockResolvedValue([]);

      await controller.listOpportunities(user, query);

      expect(mockOpportunitiesService.listOpportunities).toHaveBeenCalledWith(
        query,
        'user-1',
      );
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
