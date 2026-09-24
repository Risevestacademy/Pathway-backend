import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { TargetLevel } from '../../generated/prisma/client';

describe('CareersController', () => {
  let controller: CareersController;

  const mockCareersService = {
    getPublicCareers: jest.fn(),
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
    it('should delegate query params (interest & level) to careersService.getPublicCareers', async () => {
      const mockResult = [
        {
          id: '1',
          slug: 'software-engineer',
          title: 'Software Engineer',
          shortDescription: 'Builds software applications.',
        },
      ];
      mockCareersService.getPublicCareers.mockResolvedValue(mockResult);

      const query: GetCareersQueryDto = {
        level: TargetLevel.ENTRY,
        interest: 'software-engineering',
      };

      const result = await controller.getCareers(query);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });
});
