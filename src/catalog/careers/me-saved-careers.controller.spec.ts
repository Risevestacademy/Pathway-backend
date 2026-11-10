import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { CareersService } from './careers.service';
import type { SavedCareerListItemDto } from './dto/saved-career-list-item.dto';
import { MeSavedCareersController } from './me-saved-careers.controller';

describe('MeSavedCareersController', () => {
  let controller: MeSavedCareersController;

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
      controllers: [MeSavedCareersController],
      providers: [{ provide: CareersService, useValue: mockCareersService }],
    }).compile();

    controller = module.get<MeSavedCareersController>(MeSavedCareersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listSavedCareers', () => {
    it("delegates the caller's id to careersService.listSavedCareers", async () => {
      const saved: SavedCareerListItemDto[] = [
        {
          id: 'career-1',
          slug: 'frontend-engineer',
          title: 'Frontend Engineer',
          shortDescription: 'Builds interfaces.',
          savedAt: new Date(),
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
