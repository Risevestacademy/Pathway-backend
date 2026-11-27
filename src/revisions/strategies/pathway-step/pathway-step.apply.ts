import type { Prisma } from '../../../generated/prisma/client';
import type { ApplyResult, RevisionPlan } from '../../envelope/strategy.types';
import { PATHWAY_STEP_FIELD_CONFIG } from './pathway-step.config';

const EDITABLE_FIELDS = new Set(PATHWAY_STEP_FIELD_CONFIG.map((e) => e.field));

/**
 * Writes the step row and its two link-sets, nothing else.
 *
 * - No create or delete of the step itself: a delete needs a learner-progress
 *   check on UserPathwayStep, which is out of scope.
 * - Only configured fields are written, so order and pathwayId can never reach
 *   the update.
 * - A resource link is created without a usageNote (null); see the note in
 *   pathway-step.plan.ts.
 */
export async function applyStepPlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  contentId: string,
): Promise<ApplyResult> {
  const by = (section: string, kind: string) =>
    plan.operations.filter((o) => o.section === section && o.kind === kind);

  const data: Record<string, unknown> = {};
  for (const op of by('steps', 'update')) {
    if (op.field && EDITABLE_FIELDS.has(op.field)) data[op.field] = op.after;
  }
  if (Object.keys(data).length > 0) {
    await tx.pathwayStep.update({ where: { id: contentId }, data });
  }

  for (const op of by('stepSkills', 'link')) {
    await tx.pathwayStepSkill.create({
      data: { pathwayStepId: contentId, skillId: op.entityId! },
    });
  }
  for (const op of by('stepSkills', 'unlink')) {
    await tx.pathwayStepSkill.delete({
      where: {
        pathwayStepId_skillId: {
          pathwayStepId: contentId,
          skillId: op.entityId!,
        },
      },
    });
  }

  for (const op of by('stepResources', 'link')) {
    await tx.pathwayStepResource.create({
      data: { pathwayStepId: contentId, resourceId: op.entityId! },
    });
  }
  for (const op of by('stepResources', 'unlink')) {
    await tx.pathwayStepResource.delete({
      where: {
        pathwayStepId_resourceId: {
          pathwayStepId: contentId,
          resourceId: op.entityId!,
        },
      },
    });
  }

  return { createdIds: new Map() };
}
