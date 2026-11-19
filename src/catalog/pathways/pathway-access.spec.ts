import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CareerStatus, ResourceStatus } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma';
import {
  assertPathwayReadable,
  assertResourceBelongsToPathway,
  assertTaskBelongsToPathway,
  findPathwayResource,
  findReadablePathway,
  loadResourceCompletions,
  loadTaskCompletions,
} from './pathway-access';

describe('pathway access helpers', () => {
  const findFirst = jest.fn<(args: unknown) => Promise<unknown>>();
  const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>();

  const prisma = {
    pathway: { findFirst },
    resource: { findFirst },
    pathwayStepTask: { findFirst },
    userResourceCompletion: { findMany },
    userTask: { findMany },
  } as unknown as PrismaService;

  const completedAt = new Date('2026-11-19T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findReadablePathway', () => {
    it('looks the pathway up under a PUBLISHED career or a RETIRED career the user saved', async () => {
      findFirst.mockResolvedValue(null);

      await findReadablePathway(prisma, 'pathway-1', 'user-1');

      expect(findFirst).toHaveBeenCalledWith({
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

    it('reports a saved pathway with its start step', async () => {
      findFirst.mockResolvedValue({
        careerId: 'career-1',
        career: { userPathways: [{ startStepId: 'step-2' }] },
      });

      await expect(
        findReadablePathway(prisma, 'pathway-1', 'user-1'),
      ).resolves.toEqual({
        pathwayId: 'pathway-1',
        careerId: 'career-1',
        saved: true,
        startStepId: 'step-2',
      });
    });

    it('reports an unsaved pathway', async () => {
      findFirst.mockResolvedValue({
        careerId: 'career-1',
        career: { userPathways: [] },
      });

      await expect(
        findReadablePathway(prisma, 'pathway-1', 'user-1'),
      ).resolves.toMatchObject({ saved: false, startStepId: null });
    });

    it('returns null for an unreadable pathway', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        findReadablePathway(prisma, 'pathway-1', 'user-1'),
      ).resolves.toBeNull();
    });
  });

  describe('assertPathwayReadable', () => {
    it('throws NotFoundException for an unreadable pathway', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        assertPathwayReadable(prisma, 'pathway-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPathwayResource', () => {
    const linkedToPathway = [
      { pathwaySteps: { some: { pathwayStep: { pathwayId: 'pathway-1' } } } },
      {
        careerResources: {
          some: { career: { pathway: { is: { id: 'pathway-1' } } } },
        },
      },
    ];

    it('matches an ACTIVE resource linked by a step or by the career', async () => {
      findFirst.mockResolvedValue({ id: 'resource-1' });

      await findPathwayResource(prisma, 'resource-1', 'pathway-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'resource-1',
          status: ResourceStatus.ACTIVE,
          OR: linkedToPathway,
        },
        select: { id: true },
      });
    });

    it('also matches a withdrawn resource when activeOnly is false', async () => {
      findFirst.mockResolvedValue({ id: 'resource-1' });

      await findPathwayResource(prisma, 'resource-1', 'pathway-1', {
        activeOnly: false,
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'resource-1', OR: linkedToPathway },
        select: { id: true },
      });
    });
  });

  describe('assertResourceBelongsToPathway', () => {
    it('throws NotFoundException for a resource from another pathway', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        assertResourceBelongsToPathway(prisma, 'resource-9', 'pathway-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertTaskBelongsToPathway', () => {
    it('looks the task up on a step of the pathway', async () => {
      findFirst.mockResolvedValue({ id: 'task-1', stepId: 'step-1' });

      await expect(
        assertTaskBelongsToPathway(prisma, 'task-1', 'pathway-1'),
      ).resolves.toEqual({ id: 'task-1', stepId: 'step-1' });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', step: { pathwayId: 'pathway-1' } },
        select: { id: true, stepId: true },
      });
    });

    it('throws NotFoundException for a task from another pathway', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        assertTaskBelongsToPathway(prisma, 'task-9', 'pathway-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('loadResourceCompletions', () => {
    it("maps the user's completed resources to their completion time", async () => {
      findMany.mockResolvedValue([{ resourceId: 'resource-1', completedAt }]);

      const completions = await loadResourceCompletions(prisma, 'user-1', [
        'resource-1',
        'resource-2',
      ]);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          resourceId: { in: ['resource-1', 'resource-2'] },
        },
        select: { resourceId: true, completedAt: true },
      });
      expect(completions).toEqual(new Map([['resource-1', completedAt]]));
    });

    it('skips the query when there are no resources', async () => {
      await expect(
        loadResourceCompletions(prisma, 'user-1', []),
      ).resolves.toEqual(new Map());
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('loadTaskCompletions', () => {
    it("maps the user's completed tasks to their completion time", async () => {
      findMany.mockResolvedValue([{ taskId: 'task-1', completedAt }]);

      const completions = await loadTaskCompletions(prisma, 'user-1', [
        'task-1',
        'task-2',
      ]);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          taskId: { in: ['task-1', 'task-2'] },
          completedAt: { not: null },
        },
        select: { taskId: true, completedAt: true },
      });
      expect(completions).toEqual(new Map([['task-1', completedAt]]));
    });

    it('skips the query when there are no tasks', async () => {
      await expect(loadTaskCompletions(prisma, 'user-1', [])).resolves.toEqual(
        new Map(),
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
