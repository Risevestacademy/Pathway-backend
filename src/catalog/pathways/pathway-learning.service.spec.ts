import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma';
import {
  pathwayResourcesStageSelect,
  resourceDetailSelect,
  resourceItemSelect,
} from './mappers/pathway-resources.mapper';
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
});
