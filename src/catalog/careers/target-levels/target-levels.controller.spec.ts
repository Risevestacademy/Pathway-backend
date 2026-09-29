import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TargetLevelsController } from './target-levels.controller';
import { CareersService } from '../careers.service';
import { TargetLevel } from '../../../generated/prisma/client';

describe('TargetLevelsController', () => {
  let controller: TargetLevelsController;

  const mockCareersService = {
    getTargetLevels: jest.fn<() => TargetLevel[]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TargetLevelsController],
      providers: [
        {
          provide: CareersService,
          useValue: mockCareersService,
        },
      ],
    }).compile();

    controller = module.get<TargetLevelsController>(TargetLevelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTargetLevels', () => {
    it('should return the target levels from careersService.getTargetLevels', () => {
      const mockResult: TargetLevel[] = [
        TargetLevel.STUDENT,
        TargetLevel.RECENT_GRAD,
        TargetLevel.EARLY_CAREER,
      ];

      mockCareersService.getTargetLevels.mockReturnValue(mockResult);

      const result = controller.getTargetLevels();

      expect(mockCareersService.getTargetLevels).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });
  });
});
