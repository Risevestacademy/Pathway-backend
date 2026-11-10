import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TargetLevel } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common';
import { CareersService } from './careers.service';
import type { SavedCareerListItemDto } from './dto/saved-career-list-item.dto';
import { MeCareersController } from './me-careers.controller';

describe('MeCareersController', () => {
  let controller: MeCareersController;

  const mockCareersService = {
    listSavedCareers:
      jest.fn<(userId: string) => Promise<SavedCareerListItemDto[]>>(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeCareersController],
      providers: [{ provide: CareersService, useValue: mockCareersService }],
    }).compile();

    controller = module.get<MeCareersController>(MeCareersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listSavedCareers', () => {
    it("delegates the caller's id to careersService.listSavedCareers", async () => {
      const savedAt = new Date('2026-11-09T10:00:00.000Z');
      const saved: SavedCareerListItemDto[] = [
        {
          id: 'career-1',
          slug: 'frontend-engineer',
          title: 'Frontend Engineer',
          description: 'Builds interfaces.',
          iconKey: 'fe-icon',
          targetLevels: [TargetLevel.STUDENT],
          topicCount: 2,
          resourceCount: 8,
          savedAt,
          isActivePathway: false,
          isRetired: false,
        },
      ];
      mockCareersService.listSavedCareers.mockResolvedValue(saved);

      const result = await controller.listSavedCareers(user);

      expect(mockCareersService.listSavedCareers).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result).toEqual(saved);
    });
  });
});
