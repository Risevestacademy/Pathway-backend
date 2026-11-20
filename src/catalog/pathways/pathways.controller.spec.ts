import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { Role } from '../../generated/prisma/client';
import type { PathwayReadDto } from './dto/pathway-read.dto';
import type {
  PathwayResourceDetailDto,
  PathwayResourcesDto,
} from './dto/pathway-resources.dto';
import type {
  PathwayTaskDetailDto,
  PathwayTasksDto,
} from './dto/pathway-tasks.dto';
import type { StageQuizDto } from './dto/stage-quiz.dto';
import { PathwayLearningService } from './pathway-learning.service';
import { PathwaysController } from './pathways.controller';
import { PathwaysService } from './pathways.service';

describe('PathwaysController', () => {
  let controller: PathwaysController;

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.USER,
  };

  const mockPathwaysService = {
    getPathwayRead:
      jest.fn<
        (pathwayId: string, userId: string | null) => Promise<PathwayReadDto>
      >(),
  };

  const mockPathwayLearningService = {
    getPathwayResources:
      jest.fn<
        (userId: string, pathwayId: string) => Promise<PathwayResourcesDto>
      >(),
    getPathwayResource:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          resourceId: string,
          stepId?: string,
        ) => Promise<PathwayResourceDetailDto>
      >(),
    getPathwayTasks:
      jest.fn<
        (userId: string, pathwayId: string) => Promise<PathwayTasksDto>
      >(),
    getPathwayTask:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          taskId: string,
        ) => Promise<PathwayTaskDetailDto>
      >(),
    getStageQuiz:
      jest.fn<
        (
          userId: string,
          pathwayId: string,
          stageId: string,
        ) => Promise<StageQuizDto>
      >(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwaysController],
      providers: [
        { provide: PathwaysService, useValue: mockPathwaysService },
        {
          provide: PathwayLearningService,
          useValue: mockPathwayLearningService,
        },
      ],
    }).compile();

    controller = module.get(PathwaysController);
  });

  it('delegates GET /pathways/:pathwayId/resources with the caller id', async () => {
    const response = { pathwayId: 'pathway-1' } as PathwayResourcesDto;
    mockPathwayLearningService.getPathwayResources.mockResolvedValue(response);

    await expect(
      controller.getPathwayResources(user, 'pathway-1'),
    ).resolves.toBe(response);
    expect(mockPathwayLearningService.getPathwayResources).toHaveBeenCalledWith(
      'user-1',
      'pathway-1',
    );
  });

  it('delegates GET /pathways/:pathwayId/resources/:resourceId with the stepId', async () => {
    const response = { id: 'resource-1' } as PathwayResourceDetailDto;
    mockPathwayLearningService.getPathwayResource.mockResolvedValue(response);

    await expect(
      controller.getPathwayResource(user, 'pathway-1', 'resource-1', {
        stepId: 'step-1',
      }),
    ).resolves.toBe(response);
    expect(mockPathwayLearningService.getPathwayResource).toHaveBeenCalledWith(
      'user-1',
      'pathway-1',
      'resource-1',
      'step-1',
    );
  });

  it('delegates GET /pathways/:pathwayId/tasks with the caller id', async () => {
    const response = { pathwayId: 'pathway-1' } as PathwayTasksDto;
    mockPathwayLearningService.getPathwayTasks.mockResolvedValue(response);

    await expect(controller.getPathwayTasks(user, 'pathway-1')).resolves.toBe(
      response,
    );
    expect(mockPathwayLearningService.getPathwayTasks).toHaveBeenCalledWith(
      'user-1',
      'pathway-1',
    );
  });

  it('delegates GET /pathways/:pathwayId/tasks/:taskId with the caller id', async () => {
    const response = { id: 'task-1' } as PathwayTaskDetailDto;
    mockPathwayLearningService.getPathwayTask.mockResolvedValue(response);

    await expect(
      controller.getPathwayTask(user, 'pathway-1', 'task-1'),
    ).resolves.toBe(response);
    expect(mockPathwayLearningService.getPathwayTask).toHaveBeenCalledWith(
      'user-1',
      'pathway-1',
      'task-1',
    );
  });

  it('delegates GET /pathways/:pathwayId/stages/:stageId/quiz with the caller id', async () => {
    const response = { id: 'quiz-1' } as StageQuizDto;
    mockPathwayLearningService.getStageQuiz.mockResolvedValue(response);

    await expect(
      controller.getStageQuiz(user, 'pathway-1', 'stage-1'),
    ).resolves.toBe(response);
    expect(mockPathwayLearningService.getStageQuiz).toHaveBeenCalledWith(
      'user-1',
      'pathway-1',
      'stage-1',
    );
  });
});