import type { Prisma } from '../../../generated/prisma/client';
import type { LivePathwayStageForPlan } from './pathway-stage.types';

export async function loadLivePathwayStage(
  tx: Prisma.TransactionClient,
  stageId: string,
): Promise<LivePathwayStageForPlan | null> {
  return tx.pathwayStage.findUnique({ where: { id: stageId } });
}

export async function lockPathwayStage(
  tx: Prisma.TransactionClient,
  stageId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "PathwayStage" WHERE "id" = ${stageId} FOR UPDATE`;
}
