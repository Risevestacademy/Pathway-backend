import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, type AuthenticatedUser } from '../../common';
import { Role } from '../../generated/prisma/enums';
import { PathwayStepsService } from './pathway-steps.service';
import type { StepCompletionResponseDto } from './dto/step-completion-response.dto';
import { PathwayCompletionController } from './pathway-completion.controller';
import { PathwayCompletionService } from './pathway-completion.service';
import type { ResourceCompletionResponseDto } from './dto/resource-completion-response.dto';
import type { TaskCompletionResponseDto } from './dto/task-completion-response.dto';
import type { ChecklistItemResponseDto } from './dto/checklist-item-response.dto';

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

  const mockPathwayCompletionService = {
    setResourceCompletion:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          resourceId: string,
          completed: boolean,
        ) => Promise<ResourceCompletionResponseDto>
      >(),
    setTaskCompletion:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          taskId: string,
          completed: boolean,
        ) => Promise<TaskCompletionResponseDto>
      >(),
    setChecklistItem:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          taskId: string,
          itemId: string,
          checked: boolean,
        ) => Promise<ChecklistItemResponseDto>
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
        {
          provide: PathwayCompletionService,
          useValue: mockPathwayCompletionService,
        },
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

  describe('setResourceCompletion', () => {
    it('delegates to pathwayCompletionService.setResourceCompletion', async () => {
      const mockResult: ResourceCompletionResponseDto = {
        resourceId: 'resource-1',
        completed: true,
        completedAt: new Date('2026-11-17T10:00:00.000Z'),
        xpAwarded: 10,
      };
      mockPathwayCompletionService.setResourceCompletion.mockResolvedValue(
        mockResult,
      );

      const result = await controller.setResourceCompletion(
        user,
        'pathway-1',
        'resource-1',
        { completed: true },
      );

      expect(
        mockPathwayCompletionService.setResourceCompletion,
      ).toHaveBeenCalledWith('user-1', 'pathway-1', 'resource-1', true);
      expect(result).toEqual(mockResult);
    });
  });

  describe('setTaskCompletion', () => {
    it('delegates to pathwayCompletionService.setTaskCompletion', async () => {
      const mockResult: TaskCompletionResponseDto = {
        taskId: 'task-1',
        completed: false,
        completedAt: null,
        xpAwarded: 0,
        checklistChecked: 1,
        checklistTotal: 3,
      };
      mockPathwayCompletionService.setTaskCompletion.mockResolvedValue(
        mockResult,
      );

      const result = await controller.setTaskCompletion(
        user,
        'pathway-1',
        'task-1',
        { completed: false },
      );

      expect(
        mockPathwayCompletionService.setTaskCompletion,
      ).toHaveBeenCalledWith('user-1', 'pathway-1', 'task-1', false);
      expect(result).toEqual(mockResult);
    });
  });

  describe('setChecklistItem', () => {
    it('delegates to pathwayCompletionService.setChecklistItem', async () => {
      const mockResult: ChecklistItemResponseDto = {
        itemId: 'item-1',
        taskId: 'task-1',
        checked: true,
        checkedAt: new Date('2026-11-17T10:00:00.000Z'),
        checklistChecked: 2,
        checklistTotal: 3,
      };
      mockPathwayCompletionService.setChecklistItem.mockResolvedValue(
        mockResult,
      );

      const result = await controller.setChecklistItem(
        user,
        'pathway-1',
        'task-1',
        'item-1',
        { checked: true },
      );

      expect(
        mockPathwayCompletionService.setChecklistItem,
      ).toHaveBeenCalledWith('user-1', 'pathway-1', 'task-1', 'item-1', true);
      expect(result).toEqual(mockResult);
    });
  });
});
