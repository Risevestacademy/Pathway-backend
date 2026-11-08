import { jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard, type AuthenticatedUser } from '../common';
import { OpportunityType } from '../generated/prisma/client';
import type { MeOpportunityScope } from './dto/get-me-opportunities-query.dto';
import type { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { MeOpportunitiesController } from './me-opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

describe('MeOpportunitiesController', () => {
  let controller: MeOpportunitiesController;

  const mockOpportunitiesService = {
    listMyOpportunities:
      jest.fn<
        (
          userId: string,
          scope: MeOpportunityScope,
        ) => Promise<OpportunityListItemDto[]>
      >(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeOpportunitiesController],
      providers: [
        { provide: OpportunitiesService, useValue: mockOpportunitiesService },
      ],
    }).compile();

    controller = module.get<MeOpportunitiesController>(
      MeOpportunitiesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listMyOpportunities', () => {
    it("delegates the caller's id and the scope to opportunitiesService.listMyOpportunities", async () => {
      const items: OpportunityListItemDto[] = [
        {
          id: 'opp-1',
          title: 'Intern',
          type: OpportunityType.INTERNSHIP,
          organisation: 'Org',
          location: 'Remote',
          status: 'OPEN',
          deadline: null,
          summary: 'Short.',
        },
      ];
      mockOpportunitiesService.listMyOpportunities.mockResolvedValue(items);

      const result = await controller.listMyOpportunities(user, {
        scope: 'pathway',
      });

      expect(mockOpportunitiesService.listMyOpportunities).toHaveBeenCalledWith(
        'user-1',
        'pathway',
      );
      expect(result).toEqual(items);
    });

    it('requires an authenticated user', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MeOpportunitiesController,
      ) as unknown[];

      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
