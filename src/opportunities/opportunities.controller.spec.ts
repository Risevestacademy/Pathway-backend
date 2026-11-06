import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import type { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';

describe('OpportunitiesController', () => {
  let controller: OpportunitiesController;

  const mockOpportunitiesService = {
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

  it('should unsave the opportunity for the authenticated user', async () => {
    mockOpportunitiesService.unsaveOpportunity.mockResolvedValue(undefined);

    await controller.unsaveOpportunity(user, 'opportunity-1');

    expect(mockOpportunitiesService.unsaveOpportunity).toHaveBeenCalledWith(
      'user-1',
      'opportunity-1',
    );
  });
});
