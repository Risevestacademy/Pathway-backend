import type { Prisma } from '../../../generated/prisma/client';
import type { LiveOutlookForPlan } from './outlook.types';

export async function loadLiveOutlook(
  tx: Prisma.TransactionClient,
  outlookId: string,
): Promise<LiveOutlookForPlan | null> {
  return tx.outlookData.findUnique({ where: { id: outlookId } });
}

export async function lockOutlook(
  tx: Prisma.TransactionClient,
  outlookId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "OutlookData" WHERE "id" = ${outlookId} FOR UPDATE`;
}
