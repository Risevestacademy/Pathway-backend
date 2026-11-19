import { NotFoundException } from '@nestjs/common';
import {
  CareerStatus,
  Prisma,
  ResourceStatus,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma';

export interface ReadablePathway {
  pathwayId: string;
  careerId: string;
  saved: boolean;
  startStepId: string | null;
}

export interface PathwayTaskRef {
  id: string;
  stepId: string;
}

// PUBLISHED, or RETIRED and saved by the caller
export const readableCareerWhere = (
  userId: string,
): Prisma.CareerWhereInput => ({
  OR: [
    { status: CareerStatus.PUBLISHED },
    { status: CareerStatus.RETIRED, userPathways: { some: { userId } } },
  ],
});

// Linked by a step in the pathway, or by the pathway's career
export const pathwayResourceWhere = (
  resourceId: string,
  pathwayId: string,
  { activeOnly = true }: { activeOnly?: boolean } = {},
): Prisma.ResourceWhereInput => ({
  id: resourceId,
  ...(activeOnly && { status: ResourceStatus.ACTIVE }),
  OR: [
    { pathwaySteps: { some: { pathwayStep: { pathwayId } } } },
    {
      careerResources: {
        some: { career: { pathway: { is: { id: pathwayId } } } },
      },
    },
  ],
});

export async function findReadablePathway(
  prisma: Pick<PrismaService, 'pathway'>,
  pathwayId: string,
  userId: string,
): Promise<ReadablePathway | null> {
  const pathway = await prisma.pathway.findFirst({
    where: { id: pathwayId, career: readableCareerWhere(userId) },
    select: {
      careerId: true,
      career: {
        select: {
          userPathways: { where: { userId }, select: { startStepId: true } },
        },
      },
    },
  });

  if (!pathway) return null;

  const [userPathway] = pathway.career.userPathways;
  return {
    pathwayId,
    careerId: pathway.careerId,
    saved: userPathway !== undefined,
    startStepId: userPathway?.startStepId ?? null,
  };
}

export async function assertPathwayReadable(
  prisma: Pick<PrismaService, 'pathway'>,
  pathwayId: string,
  userId: string,
): Promise<ReadablePathway> {
  const pathway = await findReadablePathway(prisma, pathwayId, userId);
  if (!pathway) throw new NotFoundException('Pathway not found');

  return pathway;
}

export async function findPathwayResource(
  prisma: Pick<PrismaService, 'resource'>,
  resourceId: string,
  pathwayId: string,
  options: { activeOnly?: boolean } = {},
): Promise<{ id: string } | null> {
  return prisma.resource.findFirst({
    where: pathwayResourceWhere(resourceId, pathwayId, options),
    select: { id: true },
  });
}

export async function assertResourceBelongsToPathway(
  prisma: Pick<PrismaService, 'resource'>,
  resourceId: string,
  pathwayId: string,
): Promise<void> {
  const resource = await findPathwayResource(prisma, resourceId, pathwayId);
  if (!resource) throw new NotFoundException('Resource not found');
}

export async function findPathwayTask(
  prisma: Pick<PrismaService, 'pathwayStepTask'>,
  taskId: string,
  pathwayId: string,
): Promise<PathwayTaskRef | null> {
  return prisma.pathwayStepTask.findFirst({
    where: { id: taskId, step: { pathwayId } },
    select: { id: true, stepId: true },
  });
}

export async function assertTaskBelongsToPathway(
  prisma: Pick<PrismaService, 'pathwayStepTask'>,
  taskId: string,
  pathwayId: string,
): Promise<PathwayTaskRef> {
  const task = await findPathwayTask(prisma, taskId, pathwayId);
  if (!task) throw new NotFoundException('Task not found');

  return task;
}

// Completed resources by id, with their completion time
export async function loadResourceCompletions(
  prisma: Pick<PrismaService, 'userResourceCompletion'>,
  userId: string,
  resourceIds: string[],
): Promise<Map<string, Date>> {
  if (resourceIds.length === 0) return new Map();

  const rows = await prisma.userResourceCompletion.findMany({
    where: { userId, resourceId: { in: resourceIds } },
    select: { resourceId: true, completedAt: true },
  });
  return new Map(
    rows.map(({ resourceId, completedAt }) => [resourceId, completedAt]),
  );
}

// Completed tasks by id, with their completion time; unticked tasks are left out
export async function loadTaskCompletions(
  prisma: Pick<PrismaService, 'userTask'>,
  userId: string,
  taskIds: string[],
): Promise<Map<string, Date>> {
  if (taskIds.length === 0) return new Map();

  const rows = await prisma.userTask.findMany({
    where: { userId, taskId: { in: taskIds }, completedAt: { not: null } },
    select: { taskId: true, completedAt: true },
  });
  return new Map(
    rows.flatMap(({ taskId, completedAt }) =>
      completedAt ? [[taskId, completedAt] as const] : [],
    ),
  );
}
