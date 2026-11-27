import type { Prisma } from '../../../generated/prisma/client';
import type { LivePathwayForPlan } from './pathway.types';

export async function loadLivePathway(
  tx: Prisma.TransactionClient,
  pathwayId: string,
): Promise<LivePathwayForPlan | null> {
  return tx.pathway.findUnique({ where: { id: pathwayId } });
}

export async function lockPathway(
  tx: Prisma.TransactionClient,
  pathwayId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Pathway" WHERE "id" = ${pathwayId} FOR UPDATE`;
}
