import type { Prisma } from '../../../generated/prisma/client';
import type { LiveSourceForPlan } from './source.types';

export async function loadLiveSource(
  tx: Prisma.TransactionClient,
  sourceId: string,
): Promise<LiveSourceForPlan | null> {
  return tx.source.findUnique({ where: { id: sourceId } });
}

export async function lockSource(
  tx: Prisma.TransactionClient,
  sourceId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Source" WHERE "id" = ${sourceId} FOR UPDATE`;
}
