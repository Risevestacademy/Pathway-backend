import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma';
import { stageQuizReadSelect } from './mappers/stage-quiz.mapper';
import {
  pathwayResourcesStageSelect,
  resourceDetailSelect,
  resourceItemSelect,
} from './mappers/pathway-resources.mapper';
import {
  pathwayTasksStageSelect,
  taskDetailSelect,
} from './mappers/pathway-tasks.mapper';
import { pathwayProgressStageSelect } from './mappers/pathway-progress.mapper';
import { PathwayLearningService } from './pathway-learning.service';

describe('PathwayLearningService', () => {
  let service: PathwayLearningService;

  const fn = () => jest.fn<(args: unknown) => Promise<unknown>>();

  const mockPrismaService = {
    pathway: { findFirst: fn() },
    pathwayStage: { findMany: fn() },
    userPathwayStep: { findMany: fn() },
    resource: { findFirst: fn(), findMany: fn(), findUniqueOrThrow: fn() },
    pathwayStepResource: { findFirst: fn() },
    userResourceCompletion: { findMany: fn() },
    userTask: { findMany: fn() },
    pathwayStepTask: { findFirst: fn(), findUniqueOrThrow: fn() },
    userTaskChecklistItem: { findMany: fn() },
    stageQuiz: { findFirst: fn() },
  };

  const lastCheckedDate = new Date('2026-11-01T00:00:00.000Z');
  const completedAt = new Date('2026-11-19T10:00:00.000Z');

  const resourceRow = (id: string) => ({
    id,
    title: `Resource ${id}`,
    provider: 'Example',
    type: ResourceType.ARTICLE,
    costStatus: ResourceCostStatus.FREE,
    estimatedWeeks: null,
    lastCheckedDate,
  });

  const stagesWith = (stepCount: number) => [
    {
      id: 'stage-1',
      title: 'Stage A',
      order: 1,
      quiz: null,
      steps: Array.from({ length: stepCount }, (_, i) => ({
        id: `step-${i + 1}`,
        title: `Step ${i + 1}`,
        order: i + 1,
        resources: [{ resource: resourceRow(`resource-${i + 1}`) }],
      })),
    },
  ];

  const totalCalls = () =>
    Object.values(mockPrismaService)
      .flatMap((delegate) => Object.values(delegate))
      .reduce((sum, mock) => sum + mock.mock.calls.length, 0);

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.pathway.findFirst.mockResolvedValue({
      careerId: 'career-1',
      career: { userPathways: [] },
    });
    mockPrismaService.pathwayStage.findMany.mockResolvedValue(stagesWith(2));
    mockPrismaService.userPathwayStep.findMany.mockResolvedValue([]);
    mockPrismaService.resource.findMany.mockResolvedValue([]);
    mockPrismaService.resource.findFirst.mockResolvedValue({
      id: 'resource-1',
    });
    mockPrismaService.userResourceCompletion.findMany.mockResolvedValue([]);
    mockPrismaService.userTask.findMany.mockResolvedValue([]);
    mockPrismaService.pathwayStepTask.findFirst.mockResolvedValue({
      id: 'task-1',
      stepId: 'step-1',
    });
    mockPrismaService.userTaskChecklistItem.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwayLearningService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(PathwayLearningService);
  });

  describe('getPathwayResources', () => {
    it('reads the stages with ACTIVE step resources, the marks and the optional courses', async () => {
      await service.getPathwayResources('user-1', 'pathway-1');

      expect(mockPrismaService.pathwayStage.findMany).toHaveBeenCalledWith({
        where: { pathwayId: 'pathway-1' },
        orderBy: { order: 'asc' },
        select: pathwayResourcesStageSelect('user-1'),
      });
      expect(
        pathwayResourcesStageSelect('user-1').steps.select.resources.where,
      ).toEqual({ resource: { status: ResourceStatus.ACTIVE } });
      expect(mockPrismaService.userPathwayStep.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', pathwayStep: { pathwayId: 'pathway-1' } },
        select: { pathwayStepId: true, status: true, completedAt: true },
      });
      expect(mockPrismaService.resource.findMany).toHaveBeenCalledWith({
        where: {
          status: ResourceStatus.ACTIVE,
          type: ResourceType.COURSE,
          costStatus: ResourceCostStatus.PAID,
          careerResources: { some: { careerId: 'career-1' } },
          pathwaySteps: { none: { pathwayStep: { pathwayId: 'pathway-1' } } },
        },
        orderBy: { title: 'asc' },
        select: resourceItemSelect,
      });
    });

    it("loads the user's completions for every listed resource", async () => {
      mockPrismaService.resource.findMany.mockResolvedValue([
        resourceRow('course-1'),
      ]);
      mockPrismaService.userResourceCompletion.findMany.mockResolvedValue([
        { resourceId: 'resource-1', completedAt },
      ]);

      const result = await service.getPathwayResources('user-1', 'pathway-1');

      expect(
        mockPrismaService.userResourceCompletion.findMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          resourceId: { in: ['resource-1', 'resource-2', 'course-1'] },
        },
        select: { resourceId: true, completedAt: true },
      });
      expect(result.stages[0].steps[0].resources[0]).toMatchObject({
        id: 'resource-1',
        isCompleted: true,
        completedAt,
      });
    });

    it('makes the same number of queries for a 4-step and a 16-step pathway', async () => {
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(stagesWith(4));
      await service.getPathwayResources('user-1', 'pathway-1');
      const fourSteps = totalCalls();

      jest.clearAllMocks();
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(stagesWith(16));
      await service.getPathwayResources('user-1', 'pathway-1');

      expect(totalCalls()).toBe(fourSteps);
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayResources('user-1', 'pathway-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.pathwayStage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPathwayResource', () => {
    const detailRow = {
      ...resourceRow('resource-1'),
      description: 'About it',
      outcomes: ['Write types'],
      url: 'https://example.com',
    };

    const tasks = [
      { id: 'task-1', title: 'Task 1', goal: 'First', estimatedWeeks: 1 },
      { id: 'task-2', title: 'Task 2', goal: 'Second', estimatedWeeks: null },
    ];

    beforeEach(() => {
      mockPrismaService.resource.findUniqueOrThrow.mockResolvedValue(detailRow);
      mockPrismaService.pathwayStepResource.findFirst.mockResolvedValue({
        usageNote: 'Read chapter 2',
        pathwayStep: { tasks },
      });
    });

    it('returns the usage note and the first task the user has not completed', async () => {
      mockPrismaService.userTask.findMany.mockResolvedValue([
        { taskId: 'task-1', completedAt },
      ]);

      const result = await service.getPathwayResource(
        'user-1',
        'pathway-1',
        'resource-1',
        'step-1',
      );

      expect(mockPrismaService.resource.findUniqueOrThrow).toHaveBeenCalledWith(
        { where: { id: 'resource-1' }, select: resourceDetailSelect },
      );
      expect(
        mockPrismaService.pathwayStepResource.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pathwayStepId: 'step-1',
            resourceId: 'resource-1',
            pathwayStep: { pathwayId: 'pathway-1' },
          },
        }),
      );
      expect(result).toMatchObject({
        id: 'resource-1',
        outcomes: ['Write types'],
        url: 'https://example.com',
        usageNote: 'Read chapter 2',
        nextTask: tasks[1],
      });
      expect(result).not.toHaveProperty('curationRationale');
    });

    it('returns no next task when every task in the step is done', async () => {
      mockPrismaService.userTask.findMany.mockResolvedValue([
        { taskId: 'task-1', completedAt },
        { taskId: 'task-2', completedAt },
      ]);

      const result = await service.getPathwayResource(
        'user-1',
        'pathway-1',
        'resource-1',
        'step-1',
      );

      expect(result.nextTask).toBeNull();
    });

    it('returns no usage note or next task without a stepId', async () => {
      const result = await service.getPathwayResource(
        'user-1',
        'pathway-1',
        'resource-1',
      );

      expect(
        mockPrismaService.pathwayStepResource.findFirst,
      ).not.toHaveBeenCalled();
      expect(result).toMatchObject({ usageNote: null, nextTask: null });
    });

    it('throws NotFoundException for a resource from another pathway', async () => {
      mockPrismaService.resource.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayResource('user-1', 'pathway-1', 'resource-9'),
      ).rejects.toThrow(NotFoundException);
      expect(
        mockPrismaService.resource.findUniqueOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the step does not use the resource', async () => {
      mockPrismaService.pathwayStepResource.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayResource(
          'user-1',
          'pathway-1',
          'resource-1',
          'step-9',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayResource('user-1', 'pathway-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.resource.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getPathwayTasks', () => {
    const taskStagesWith = (stepCount: number) => [
      {
        id: 'stage-1',
        title: 'Stage A',
        order: 1,
        quiz: null,
        steps: Array.from({ length: stepCount }, (_, i) => ({
          id: `step-${i + 1}`,
          title: `Step ${i + 1}`,
          order: i + 1,
          tasks: [
            {
              id: `task-${i + 1}`,
              title: `Task ${i + 1}`,
              goal: 'Build it',
              estimatedWeeks: null,
              _count: { checklistItems: 2 },
            },
          ],
        })),
      },
    ];

    beforeEach(() => {
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        taskStagesWith(2),
      );
    });

    it("reads the stages with tasks, the marks and only the caller's checklist ticks", async () => {
      await service.getPathwayTasks('user-1', 'pathway-1');

      expect(mockPrismaService.pathwayStage.findMany).toHaveBeenCalledWith({
        where: { pathwayId: 'pathway-1' },
        orderBy: { order: 'asc' },
        select: pathwayTasksStageSelect('user-1'),
      });
      expect(mockPrismaService.userPathwayStep.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', pathwayStep: { pathwayId: 'pathway-1' } },
        select: { pathwayStepId: true, status: true, completedAt: true },
      });
      expect(
        mockPrismaService.userTaskChecklistItem.findMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          item: { task: { step: { pathwayId: 'pathway-1' } } },
        },
        select: { item: { select: { taskId: true } } },
      });
    });

    it("maps the caller's task completions and checklist counts", async () => {
      mockPrismaService.userTask.findMany.mockResolvedValue([
        { taskId: 'task-1', completedAt },
      ]);
      mockPrismaService.userTaskChecklistItem.findMany.mockResolvedValue([
        { item: { taskId: 'task-1' } },
      ]);

      const result = await service.getPathwayTasks('user-1', 'pathway-1');

      expect(mockPrismaService.userTask.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          taskId: { in: ['task-1', 'task-2'] },
          completedAt: { not: null },
        },
        select: { taskId: true, completedAt: true },
      });
      expect(result.stages[0].steps[0].tasks[0]).toMatchObject({
        id: 'task-1',
        isCompleted: true,
        completedAt,
        checklistChecked: 1,
        checklistTotal: 2,
      });
      expect(result.stages[0].steps[1].tasks[0]).toMatchObject({
        isCompleted: false,
        checklistChecked: 0,
      });
    });

    it('makes the same number of queries for a 4-step and a 16-step pathway', async () => {
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        taskStagesWith(4),
      );
      await service.getPathwayTasks('user-1', 'pathway-1');
      const fourSteps = totalCalls();

      jest.clearAllMocks();
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        taskStagesWith(16),
      );
      await service.getPathwayTasks('user-1', 'pathway-1');

      expect(totalCalls()).toBe(fourSteps);
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayTasks('user-1', 'pathway-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.pathwayStage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPathwayTask', () => {
    beforeEach(() => {
      mockPrismaService.pathwayStepTask.findUniqueOrThrow.mockResolvedValue({
        id: 'task-1',
        title: 'Task 1',
        goal: 'Build it',
        estimatedWeeks: 1,
        _count: { checklistItems: 1 },
        stepId: 'step-1',
        whatToMake: ['A page'],
        hints: ['Start small'],
        checklistItems: [
          {
            id: 'item-1',
            text: 'Check it',
            userChecks: [{ checkedAt: completedAt }],
          },
        ],
        resources: [],
      });
    });

    it("reads the task with the caller's ticks and returns the brief", async () => {
      const result = await service.getPathwayTask(
        'user-1',
        'pathway-1',
        'task-1',
      );

      expect(mockPrismaService.pathwayStepTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', step: { pathwayId: 'pathway-1' } },
        select: { id: true, stepId: true },
      });
      expect(
        mockPrismaService.pathwayStepTask.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        select: taskDetailSelect('user-1'),
      });
      expect(
        taskDetailSelect('user-1').checklistItems.select.userChecks.where,
      ).toEqual({ userId: 'user-1' });
      expect(taskDetailSelect('user-1').resources.where).toEqual({
        resource: { status: ResourceStatus.ACTIVE },
      });
      expect(result).toMatchObject({
        id: 'task-1',
        stepId: 'step-1',
        checklistChecked: 1,
        checklistTotal: 1,
        checklist: [{ id: 'item-1', isChecked: true }],
      });
    });

    it('throws NotFoundException for a task from another pathway', async () => {
      mockPrismaService.pathwayStepTask.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayTask('user-1', 'pathway-1', 'task-9'),
      ).rejects.toThrow(NotFoundException);
      expect(
        mockPrismaService.pathwayStepTask.findUniqueOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayTask('user-1', 'pathway-1', 'task-1'),
      ).rejects.toThrow(NotFoundException);
      expect(
        mockPrismaService.pathwayStepTask.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getStageQuiz', () => {
    const quizRow = {
      id: 'quiz-1',
      stageId: 'stage-1',
      questions: [
        {
          id: 'q1',
          prompt: 'Which one?',
          options: [
            { id: 'q1-o0', text: 'A' },
            { id: 'q1-o1', text: 'B' },
            { id: 'q1-o2', text: 'C' },
            { id: 'q1-o3', text: 'D' },
          ],
        },
      ],
    };

    beforeEach(() => {
      mockPrismaService.stageQuiz.findFirst.mockResolvedValue(quizRow);
    });

    it('reads the quiz of a stage in this pathway with the answer-free select', async () => {
      await service.getStageQuiz('user-1', 'pathway-1', 'stage-1');

      expect(mockPrismaService.stageQuiz.findFirst).toHaveBeenCalledWith({
        where: { stageId: 'stage-1', stage: { pathwayId: 'pathway-1' } },
        select: stageQuizReadSelect,
      });
    });

    it('returns the questions and options', async () => {
      await expect(
        service.getStageQuiz('user-1', 'pathway-1', 'stage-1'),
      ).resolves.toEqual(quizRow);
    });

    it('never returns a correct option', async () => {
      mockPrismaService.stageQuiz.findFirst.mockResolvedValue({
        ...quizRow,
        questions: [{ ...quizRow.questions[0], correctIndex: 2 }],
      });

      const result = await service.getStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
      );

      expect(JSON.stringify(result)).not.toMatch(/correct/i);
    });

    it('does not look at earlier attempts, so a quiz can be retaken', async () => {
      await service.getStageQuiz('user-1', 'pathway-1', 'stage-1');

      expect(totalCalls()).toBe(2);
    });

    it('throws NotFoundException for a stage of another pathway or one with no quiz', async () => {
      mockPrismaService.stageQuiz.findFirst.mockResolvedValue(null);

      await expect(
        service.getStageQuiz('user-1', 'pathway-1', 'stage-9'),
      ).rejects.toThrow(new NotFoundException('Quiz not found'));
    });

    it('throws NotFoundException for an unreadable pathway and reads no quiz', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getStageQuiz('user-1', 'pathway-1', 'stage-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.stageQuiz.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getPathwayProgress', () => {
    const progressStagesWith = (stepCount: number) => [
      {
        id: 'stage-1',
        title: 'Stage A',
        order: 1,
        quiz: null,
        steps: Array.from({ length: stepCount }, (_, i) => ({
          id: `step-${i + 1}`,
          title: `Step ${i + 1}`,
          order: i + 1,
        })),
      },
    ];

    beforeEach(() => {
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        progressStagesWith(3),
      );
    });

    it('reads the stages and the marks, and starts from the saved start step', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue({
        careerId: 'career-1',
        career: { userPathways: [{ startStepId: 'step-2' }] },
      });
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
        { pathwayStepId: 'step-1', status: 'COMPLETED', completedAt },
      ]);

      const result = await service.getPathwayProgress('user-1', 'pathway-1');

      expect(mockPrismaService.pathwayStage.findMany).toHaveBeenCalledWith({
        where: { pathwayId: 'pathway-1' },
        orderBy: { order: 'asc' },
        select: pathwayProgressStageSelect('user-1'),
      });
      expect(mockPrismaService.userPathwayStep.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', pathwayStep: { pathwayId: 'pathway-1' } },
        select: { pathwayStepId: true, status: true, completedAt: true },
      });
      expect(result).toMatchObject({
        pathwayId: 'pathway-1',
        progress: { completed: 1, total: 3, percentage: 33 },
        completedSteps: [{ id: 'step-1', completedAt }],
        nextStep: { id: 'step-2' },
      });
    });

    it('makes the same number of queries for a 4-step and a 16-step pathway', async () => {
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        progressStagesWith(4),
      );
      await service.getPathwayProgress('user-1', 'pathway-1');
      const fourSteps = totalCalls();

      jest.clearAllMocks();
      mockPrismaService.pathwayStage.findMany.mockResolvedValue(
        progressStagesWith(16),
      );
      await service.getPathwayProgress('user-1', 'pathway-1');

      expect(totalCalls()).toBe(fourSteps);
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.getPathwayProgress('user-1', 'pathway-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.pathwayStage.findMany).not.toHaveBeenCalled();
    });
  });
});
