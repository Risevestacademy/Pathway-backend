import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, type AuthenticatedUser } from '../../common';
import { Role } from '../../generated/prisma/enums';
import { PathwayStepsService } from './pathway-steps.service';
import type {
  StepCompletionStatus,
  StepStatusResponseDto,
} from './dto/step-status-response.dto';
import { MePathwayStepsController } from './me-pathway-steps.controller';

describe('MePathwayStepsController', () => {
  let controller: MePathwayStepsController;

  const mockPathwayStepsService = {
    setStepStatus:
      jest.fn<
        (
          userId: string,
          stepId: string,
          status: StepCompletionStatus,
        ) => Promise<StepStatusResponseDto>
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
      controllers: [MePathwayStepsController],
      providers: [
        { provide: PathwayStepsService, useValue: mockPathwayStepsService },
      ],
    }).compile();

    controller = module.get<MePathwayStepsController>(MePathwayStepsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('setStepStatus', () => {
    it("delegates the caller's id, the step id and the status to pathwayStepsService.setStepStatus", async () => {
      const mockResult: StepStatusResponseDto = {
        stepId: 'step-1',
        status: 'COMPLETED',
        progress: {
          completed: 1,
          total: 2,
          percentage: 50,
          nextStepId: 'step-2',
          selfReported: true,
          startStepId: null,
        },
      };

      mockPathwayStepsService.setStepStatus.mockResolvedValue(mockResult);

      const result = await controller.setStepStatus(user, 'step-1', {
        status: 'COMPLETED',
      });

      expect(mockPathwayStepsService.setStepStatus).toHaveBeenCalledWith(
        'user-1',
        'step-1',
        'COMPLETED',
      );
      expect(result).toEqual(mockResult);
    });

    it('requires an authenticated user', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MePathwayStepsController,
      ) as unknown[];

      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
