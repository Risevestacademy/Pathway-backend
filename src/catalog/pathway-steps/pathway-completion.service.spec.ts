import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PathwayCompletionService } from './pathway-completion.service';
import { PrismaService } from '../../prisma';
import { ActivityService } from '../../activity';
import { CareerStatus, ResourceStatus } from '../../generated/prisma/client';

describe('PathwayCompletionService', () => {
  let service: PathwayCompletionService;

  const fn = () => jest.fn<(args: unknown) => Promise<unknown>>();

  const mockPrismaService = {
    pathway: { findFirst: fn() },
    resource: { findFirst: fn() },
    pathwayStepTask: { findFirst: fn() },
    pathwayTaskChecklistItem: { findFirst: fn(), count: fn() },
    userResourceCompletion: {
      createMany: fn(),
      deleteMany: fn(),
      findUnique: fn(),
    },
    userTask: { updateMany: fn(), createMany: fn(), findUnique: fn() },
    userTaskChecklistItem: {
      createMany: fn(),
      deleteMany: fn(),
      findUnique: fn(),
      count: fn(),
    },
    $transaction: jest.fn(
      <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
        callback(mockPrismaService),
    ),
  };

  const mockActivityService = {
    recordResourceCompleted:
      jest.fn<
        (userId: string, resourceId: string, tx: unknown) => Promise<number>
      >(),
    recordTaskCompleted:
      jest.fn<
        (userId: string, taskId: string, tx: unknown) => Promise<number>
      >(),
    awardEarnedBadges:
      jest.fn<(userId: string, tx: unknown) => Promise<void>>(),
  };

  const completedAt = new Date('2026-11-17T10:00:00.000Z');
  const savedPathway = {
    careerId: 'career-1',
    career: { userPathways: [{ startStepId: null }] },
  };
  const unsavedPathway = {
    careerId: 'career-1',
    career: { userPathways: [] },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.pathway.findFirst.mockResolvedValue(savedPathway);
    mockPrismaService.resource.findFirst.mockResolvedValue({
      id: 'resource-1',
    });
    mockPrismaService.pathwayStepTask.findFirst.mockResolvedValue({
      id: 'task-1',
    });
    mockPrismaService.pathwayTaskChecklistItem.findFirst.mockResolvedValue({
      id: 'item-1',
    });
    mockPrismaService.pathwayTaskChecklistItem.count.mockResolvedValue(3);
    mockPrismaService.userTaskChecklistItem.count.mockResolvedValue(1);
    mockActivityService.recordResourceCompleted.mockResolvedValue(10);
    mockActivityService.recordTaskCompleted.mockResolvedValue(30);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwayCompletionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    service = module.get<PathwayCompletionService>(PathwayCompletionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('access', () => {
    it('looks the pathway up under a PUBLISHED career or a RETIRED career the user saved', async () => {
      mockPrismaService.userResourceCompletion.createMany.mockResolvedValue({
        count: 1,
      });

      await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        true,
      );

      expect(mockPrismaService.pathway.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'pathway-1',
          career: {
            OR: [
              { status: CareerStatus.PUBLISHED },
              {
                status: CareerStatus.RETIRED,
                userPathways: { some: { userId: 'user-1' } },
              },
            ],
          },
        },
        select: {
          careerId: true,
          career: {
            select: {
              userPathways: {
                where: { userId: 'user-1' },
                select: { startStepId: true },
              },
            },
          },
        },
      });
    });

    it('throws NotFoundException for an unreadable pathway', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.setTaskCompletion('user-1', 'pathway-1', 'task-1', true),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException and writes nothing when the career is not saved', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(unsavedPathway);

      await expect(
        service.setTaskCompletion('user-1', 'pathway-1', 'task-1', true),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockActivityService.recordTaskCompleted).not.toHaveBeenCalled();
    });
  });

  describe('setResourceCompletion', () => {
    beforeEach(() => {
      mockPrismaService.userResourceCompletion.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.userResourceCompletion.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.userResourceCompletion.findUnique.mockResolvedValue({
        completedAt,
      });
    });

    it("only accepts an active resource linked to one of the pathway's steps or its career", async () => {
      await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        true,
      );

      expect(mockPrismaService.resource.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'resource-1',
          status: ResourceStatus.ACTIVE,
          OR: [
            {
              pathwaySteps: {
                some: { pathwayStep: { pathwayId: 'pathway-1' } },
              },
            },
            {
              careerResources: {
                some: { career: { pathway: { is: { id: 'pathway-1' } } } },
              },
            },
          ],
        },
        select: { id: true },
      });
    });

    it('lets a learner undo a resource that is no longer active', async () => {
      await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        false,
      );

      expect(mockPrismaService.resource.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'resource-1',
          OR: [
            {
              pathwaySteps: {
                some: { pathwayStep: { pathwayId: 'pathway-1' } },
              },
            },
            {
              careerResources: {
                some: { career: { pathway: { is: { id: 'pathway-1' } } } },
              },
            },
          ],
        },
        select: { id: true },
      });
    });

    it('throws NotFoundException for a resource from another pathway', async () => {
      mockPrismaService.resource.findFirst.mockResolvedValue(null);

      await expect(
        service.setResourceCompletion(
          'user-1',
          'pathway-1',
          'resource-9',
          true,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('records the completion, the XP and the badges in one transaction', async () => {
      const result = await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        true,
      );

      expect(
        mockPrismaService.userResourceCompletion.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            resourceId: 'resource-1',
            completedAt: expect.any(Date),
          },
        ],
        skipDuplicates: true,
      });
      expect(mockActivityService.recordResourceCompleted).toHaveBeenCalledWith(
        'user-1',
        'resource-1',
        mockPrismaService,
      );
      expect(mockActivityService.awardEarnedBadges).toHaveBeenCalledWith(
        'user-1',
        mockPrismaService,
      );
      expect(result).toEqual({
        resourceId: 'resource-1',
        completed: true,
        completedAt,
        xpAwarded: 10,
      });
    });

    it('awards XP only once per resource', async () => {
      mockPrismaService.userResourceCompletion.createMany.mockResolvedValue({
        count: 0,
      });
      mockActivityService.recordResourceCompleted.mockResolvedValue(0);

      const result = await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        true,
      );

      expect(result.xpAwarded).toBe(0);
      expect(mockActivityService.awardEarnedBadges).not.toHaveBeenCalled();
    });

    it('undoing deletes the mark and records no XP', async () => {
      mockPrismaService.userResourceCompletion.findUnique.mockResolvedValue(
        null,
      );

      const result = await service.setResourceCompletion(
        'user-1',
        'pathway-1',
        'resource-1',
        false,
      );

      expect(
        mockPrismaService.userResourceCompletion.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', resourceId: 'resource-1' },
      });
      expect(
        mockActivityService.recordResourceCompleted,
      ).not.toHaveBeenCalled();
      expect(mockActivityService.awardEarnedBadges).not.toHaveBeenCalled();
      expect(result).toEqual({
        resourceId: 'resource-1',
        completed: false,
        completedAt: null,
        xpAwarded: 0,
      });
    });
  });

  describe('setTaskCompletion', () => {
    beforeEach(() => {
      mockPrismaService.userTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userTask.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userTask.findUnique.mockResolvedValue({ completedAt });
    });

    it("only accepts a task on one of the pathway's steps", async () => {
      mockPrismaService.pathwayStepTask.findFirst.mockResolvedValue(null);

      await expect(
        service.setTaskCompletion('user-1', 'pathway-1', 'task-9', true),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.pathwayStepTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-9', step: { pathwayId: 'pathway-1' } },
        select: { id: true, stepId: true },
      });
    });

    it('creates the mark when none exists and awards task XP', async () => {
      const result = await service.setTaskCompletion(
        'user-1',
        'pathway-1',
        'task-1',
        true,
      );

      expect(mockPrismaService.userTask.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', taskId: 'task-1', completedAt: null },
        data: { completedAt: expect.any(Date) },
      });
      expect(mockPrismaService.userTask.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', taskId: 'task-1', completedAt: expect.any(Date) },
        ],
        skipDuplicates: true,
      });
      expect(mockActivityService.recordTaskCompleted).toHaveBeenCalledWith(
        'user-1',
        'task-1',
        mockPrismaService,
      );
      expect(result).toEqual({
        taskId: 'task-1',
        completed: true,
        completedAt,
        xpAwarded: 30,
        checklistChecked: 1,
        checklistTotal: 3,
      });
    });

    it('re-completes an undone task by setting completedAt on the existing row', async () => {
      mockPrismaService.userTask.updateMany.mockResolvedValue({ count: 1 });
      mockActivityService.recordTaskCompleted.mockResolvedValue(0);

      const result = await service.setTaskCompletion(
        'user-1',
        'pathway-1',
        'task-1',
        true,
      );

      expect(mockPrismaService.userTask.createMany).not.toHaveBeenCalled();
      expect(result.xpAwarded).toBe(0);
      expect(mockActivityService.awardEarnedBadges).not.toHaveBeenCalled();
    });

    it('undoing clears completedAt and records no XP', async () => {
      mockPrismaService.userTask.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userTask.findUnique.mockResolvedValue({
        completedAt: null,
      });

      const result = await service.setTaskCompletion(
        'user-1',
        'pathway-1',
        'task-1',
        false,
      );

      expect(mockPrismaService.userTask.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          taskId: 'task-1',
          completedAt: { not: null },
        },
        data: { completedAt: null },
      });
      expect(mockActivityService.recordTaskCompleted).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        completed: false,
        completedAt: null,
        xpAwarded: 0,
      });
    });

    it("counts only the caller's ticks on this task's checklist", async () => {
      await service.setTaskCompletion('user-1', 'pathway-1', 'task-1', true);

      expect(
        mockPrismaService.pathwayTaskChecklistItem.count,
      ).toHaveBeenCalledWith({ where: { taskId: 'task-1' } });
      expect(
        mockPrismaService.userTaskChecklistItem.count,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', item: { taskId: 'task-1' } },
      });
    });
  });

  describe('setChecklistItem', () => {
    beforeEach(() => {
      mockPrismaService.userTaskChecklistItem.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.userTaskChecklistItem.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.userTaskChecklistItem.findUnique.mockResolvedValue({
        checkedAt: completedAt,
      });
    });

    it("throws NotFoundException for an item that isn't on the task", async () => {
      mockPrismaService.pathwayTaskChecklistItem.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        service.setChecklistItem(
          'user-1',
          'pathway-1',
          'task-1',
          'item-9',
          true,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockPrismaService.pathwayTaskChecklistItem.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: 'item-9', taskId: 'task-1' },
        select: { id: true },
      });
      expect(
        mockPrismaService.userTaskChecklistItem.createMany,
      ).not.toHaveBeenCalled();
    });

    it('ticks the item, awards nothing and returns the checklist counts', async () => {
      const result = await service.setChecklistItem(
        'user-1',
        'pathway-1',
        'task-1',
        'item-1',
        true,
      );

      expect(
        mockPrismaService.userTaskChecklistItem.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            checklistItemId: 'item-1',
            checkedAt: expect.any(Date),
          },
        ],
        skipDuplicates: true,
      });
      expect(mockActivityService.recordTaskCompleted).not.toHaveBeenCalled();
      expect(mockActivityService.awardEarnedBadges).not.toHaveBeenCalled();
      expect(mockPrismaService.userTask.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        itemId: 'item-1',
        taskId: 'task-1',
        checked: true,
        checkedAt: completedAt,
        checklistChecked: 1,
        checklistTotal: 3,
      });
    });

    it('unticking deletes the tick', async () => {
      mockPrismaService.userTaskChecklistItem.findUnique.mockResolvedValue(
        null,
      );

      const result = await service.setChecklistItem(
        'user-1',
        'pathway-1',
        'task-1',
        'item-1',
        false,
      );

      expect(
        mockPrismaService.userTaskChecklistItem.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', checklistItemId: 'item-1' },
      });
      expect(result).toMatchObject({ checked: false, checkedAt: null });
    });

    it('throws ConflictException and writes nothing when the career is not saved', async () => {
      mockPrismaService.pathway.findFirst.mockResolvedValue(unsavedPathway);

      await expect(
        service.setChecklistItem(
          'user-1',
          'pathway-1',
          'task-1',
          'item-1',
          true,
        ),
      ).rejects.toThrow(ConflictException);

      expect(
        mockPrismaService.userTaskChecklistItem.createMany,
      ).not.toHaveBeenCalled();
    });
  });
});
