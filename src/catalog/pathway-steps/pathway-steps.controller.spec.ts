import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PathwayStepsController } from './pathway-steps.controller';
import { PathwayStepsService } from './pathway-steps.service';
import { PathwayStepDetailDto } from './dto/pathway-step-detail.dto';

describe('PathwayStepsController', () => {
  let controller: PathwayStepsController;

  const mockPathwayStepsService = {
    getPathwayStepById:
      jest.fn<(stepId: string) => Promise<PathwayStepDetailDto>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwayStepsController],
      providers: [
        {
          provide: PathwayStepsService,
          useValue: mockPathwayStepsService,
        },
      ],
    }).compile();

    controller = module.get<PathwayStepsController>(PathwayStepsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPathwayStep', () => {
    it('should delegate the step id to pathwayStepsService.getPathwayStepById', async () => {
      const mockResult: PathwayStepDetailDto = {
        id: 'step-1',
        pathwayId: 'pathway-1',
        careerId: 'career-1',
        title: 'Learn TypeScript',
        description: null,
        learningObjective: 'Use TypeScript basics.',
        prerequisites: null,
        expectedActivity: 'Complete an exercise.',
        order: 1,
        skills: [{ id: 'skill-ts', name: 'TypeScript' }],
        resources: [],
      };

      mockPathwayStepsService.getPathwayStepById.mockResolvedValue(mockResult);

      const result = await controller.getPathwayStep('step-1');

      expect(mockPathwayStepsService.getPathwayStepById).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPathwayStepsService.getPathwayStepById).toHaveBeenCalledWith(
        'step-1',
      );
      expect(result).toEqual(mockResult);
    });
  });
});
