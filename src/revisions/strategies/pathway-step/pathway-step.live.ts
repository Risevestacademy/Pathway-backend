import type { Prisma } from '../../../generated/prisma/client';
import type { LivePathwayStepForPlan } from './pathway-step.types';

export async function loadLivePathwayStep(
  tx: Prisma.TransactionClient,
  stepId: string,
): Promise<LivePathwayStepForPlan | null> {
  const step = await tx.pathwayStep.findUnique({
    where: { id: stepId },
    include: { skills: true, resources: true },
  });
  if (!step) return null;

  return {
    id: step.id,
    stageId: step.stageId,
    title: step.title,
    description: step.description,
    learningObjective: step.learningObjective,
    prerequisites: step.prerequisites,
    expectedActivity: step.expectedActivity,
    order: step.order,
    skills: step.skills.map((s) => ({ skillId: s.skillId })),
    resources: step.resources.map((r) => ({ resourceId: r.resourceId })),
  };
}

export async function lockPathwayStep(
  tx: Prisma.TransactionClient,
  stepId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "PathwayStep" WHERE "id" = ${stepId} FOR UPDATE`;
}
