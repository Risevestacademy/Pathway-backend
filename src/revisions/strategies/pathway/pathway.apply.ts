import type { Prisma } from '../../../generated/prisma/client';
import type { ApplyResult, RevisionPlan } from '../../envelope/strategy.types';
import { PATHWAY_FIELD_CONFIG } from './pathway.config';

const EDITABLE_FIELDS = new Set(PATHWAY_FIELD_CONFIG.map((e) => e.field));

export async function applyPathwayPlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  contentId: string,
): Promise<ApplyResult> {
  const data: Record<string, unknown> = {};
  for (const op of plan.operations) {
    // Only configured fields are written. careerId is not in the config, so
    // it can never reach the update even if an operation named it.
    if (
      op.section === 'pathway' &&
      op.kind === 'update' &&
      op.field &&
      EDITABLE_FIELDS.has(op.field)
    ) {
      data[op.field] = op.after;
    }
  }

  if (Object.keys(data).length > 0) {
    await tx.pathway.update({ where: { id: contentId }, data });
  }

  return { createdIds: new Map() };
}
