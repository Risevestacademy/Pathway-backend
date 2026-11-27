import type { Prisma } from '../../../generated/prisma/client';
import type { ApplyResult, RevisionPlan } from '../../envelope/strategy.types';
import { PATHWAY_STAGE_FIELD_CONFIG } from './pathway-stage.config';

const EDITABLE_FIELDS = new Set(PATHWAY_STAGE_FIELD_CONFIG.map((e) => e.field));

export async function applyStagePlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  contentId: string,
): Promise<ApplyResult> {
  const data: Record<string, unknown> = {};
  for (const op of plan.operations) {
    // Only configured fields are written, so order and pathwayId can never
    // reach the update.
    if (
      op.section === 'stages' &&
      op.kind === 'update' &&
      op.field &&
      EDITABLE_FIELDS.has(op.field)
    ) {
      data[op.field] = op.after;
    }
  }

  if (Object.keys(data).length > 0) {
    await tx.pathwayStage.update({ where: { id: contentId }, data });
  }

  return { createdIds: new Map() };
}
