import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, type AuthenticatedUser } from '../../common';
import { Role } from '../../generated/prisma/enums';
import { PathwayStepsService } from './pathway-steps.service';
import type { StepCompletionResponseDto } from './dto/step-completion-response.dto';
import { PathwayCompletionController } from './pathway-completion.controller';

describe('PathwayCompletionController', () => {
  let controller: PathwayCompletionController;

  const mockPathwayStepsService = {
    setStepCompletion:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          stepId: string,
          completed: boolean,
        ) => Promise<StepCompletionResponseDto>
      >(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwayCompletionController],
      providers: [
        { provide: PathwayStepsService, useValue: mockPathwayStepsService },
      ],
    }).compile();

    controller = module.get<PathwayCompletionController>(
      PathwayCompletionController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('requires an authenticated user', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PathwayCompletionController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  describe('setStepCompletion', () => {
    it("delegates the caller's id, the path ids and the flag to pathwayStepsService.setStepCompletion", async () => {
      const mockResult: StepCompletionResponseDto = {
        stepId: 'step-1',
        status: 'COMPLETED',
        completedAt: new Date('2026-11-17T10:00:00.000Z'),
        progress: {
          completed: 1,
          total: 2,
          percentage: 50,
          nextStepId: 'step-2',
          selfReported: true,
        },
        stageProgress: {
          stageId: 'stage-1',
          completed: 1,
          total: 2,
          percentage: 50,
        },
        nextStepId: 'step-2',
        xpAwarded: 50,
      };
      mockPathwayStepsService.setStepCompletion.mockResolvedValue(mockResult);

      const result = await controller.setStepCompletion(
        user,
        'pathway-1',
        'step-1',
        { completed: true },
      );

      expect(mockPathwayStepsService.setStepCompletion).toHaveBeenCalledWith(
        'user-1',
        'pathway-1',
        'step-1',
        true,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
