import type { Prisma } from '../../../generated/prisma/client';
import type { ApplyResult, RevisionPlan } from '../../envelope/strategy.types';

export async function applySourcePlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  contentId: string,
): Promise<ApplyResult> {
  const data: Record<string, unknown> = {};
  for (const op of plan.operations) {
    if (op.section === 'sources' && op.kind === 'update' && op.field) {
      data[op.field] = op.after;
    }
  }

  if (Object.keys(data).length > 0) {
    await tx.source.update({ where: { id: contentId }, data });
  }

  return { createdIds: new Map() };
}
