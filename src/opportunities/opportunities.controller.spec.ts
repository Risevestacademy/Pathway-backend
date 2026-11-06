import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { OpportunityType } from '../generated/prisma/client';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import type { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

describe('OpportunitiesController', () => {
  let controller: OpportunitiesController;

  const mockOpportunitiesService = {
    listOpportunities:
      jest.fn<
        (query: GetOpportunitiesQueryDto) => Promise<OpportunityListItemDto[]>
      >(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpportunitiesController],
      providers: [
        { provide: OpportunitiesService, useValue: mockOpportunitiesService },
      ],
    }).compile();

    controller = module.get(OpportunitiesController);
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
});
