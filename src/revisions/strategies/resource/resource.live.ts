import type { Prisma } from '../../../generated/prisma/client';
import type { LiveResourceForPlan } from './resource.types';

export async function loadLiveResource(
  tx: Prisma.TransactionClient,
  resourceId: string,
): Promise<LiveResourceForPlan | null> {
  return tx.resource.findUnique({ where: { id: resourceId } });
}

export async function lockResource(
  tx: Prisma.TransactionClient,
  resourceId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Resource" WHERE "id" = ${resourceId} FOR UPDATE`;
}
