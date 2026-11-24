import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { DomainException } from '../../../common';
import type { RevisionPlan } from '../../envelope/strategy.types';
import type { ApplyResult } from '../../envelope/strategy.types';
import type { LiveCareerForPlan, LiveResource } from './career.types';

const REORDER_OFFSET = 10000;

/**
 * Apply a career revision plan inside the caller's transaction.
 *
 * This is the moved `applyPlan` from the old `content-revisions.service.ts`,
 * with three changes:
 *
 *   1. It takes a `RevisionPlan` (the envelope's shape) rather than the old
 *      `CareerPlan`. The two are structurally compatible for the fields used
 *      here (operations, blockers).
 *   2. It returns `ApplyResult` (`{ createdIds }`) so the publisher can
 *      rewrite temp IDs in subsequent revisions' snapshots. The old
 *      `applyPlan` collected created IDs into a local map; here they're
 *      returned.
 *   3. The old signature was `(tx, plan, live, careerId)`. Same here.
 *
 * Behaviour is otherwise unchanged. Every operation the old plan emitted is
 * applied here identically. The existing apply tests must pass unchanged.
 *
 * MUST NOT commit or roll back. The caller owns the transaction.
 * MUST be safe for an empty plan.
 */
export async function applyCareerPlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  live: LiveCareerForPlan | null,
  careerId: string,
): Promise<ApplyResult> {
  const createdIds = new Map<string, string>();

  const by = (section: string, ...kinds: string[]) =>
    plan.operations.filter(
      (o) => o.section === section && kinds.includes(o.kind),
    );

  // ── 1. Resource creates FIRST (temp-id step links may reference them)
  for (const op of by('resources', 'create')) {
    const snap = op.after as LiveResource & { id: string };
    const created = await tx.resource.create({
      data: {
        title: snap.title,
        description: snap.description,
        url: snap.url,
        type: snap.type as never,
        provider: snap.provider,
        costStatus: snap.costStatus as never,
        certificationCost: snap.certificationCost as never,
        curationRationale: snap.curationRationale,
        lastCheckedDate: snap.lastCheckedDate,
      },
      select: { id: true },
    });
    if (op.entityId) createdIds.set(op.entityId, created.id);
  }

  const resolveResourceId = (id: string | undefined): string | undefined =>
    id && createdIds.get(id) ? createdIds.get(id) : id;

  // ── 2. Resource updates
  for (const op of by('resources', 'update')) {
    const snap = op.after as LiveResource;
    await tx.resource.update({
      where: { id: op.entityId! },
      data: {
        title: snap.title,
        description: snap.description,
        url: snap.url,
        type: snap.type as never,
        provider: snap.provider,
        costStatus: snap.costStatus as never,
        certificationCost: snap.certificationCost as never,
        curationRationale: snap.curationRationale,
        lastCheckedDate: snap.lastCheckedDate,
      },
    });
  }

  // ── 3. Career field updates (grouped by field — one update)
  const careerUpdates = by('career', 'update');
  if (careerUpdates.length > 0) {
    const data: Record<string, unknown> = {};
    for (const op of careerUpdates) data[op.field!] = op.after;
    await tx.career.update({ where: { id: careerId }, data });
  }

  // ── 4. Pathway create / update / delete
  for (const op of by('pathway', 'create')) {
    await tx.pathway.create({
      data: {
        careerId,
        title: (op.after as { title: string }).title,
        description: (op.after as { description: string | null }).description,
      },
    });
  }
  const pathwayUpdates = by('pathway', 'update');
  if (pathwayUpdates.length > 0 && live?.pathway) {
    const data: Record<string, unknown> = {};
    for (const op of pathwayUpdates) data[op.field!] = op.after;
    await tx.pathway.update({ where: { id: live.pathway.id }, data });
  }

  // ── 5. Steps: two-pass reorder → updates → creates → deletes
  const stepMoves = by('steps', 'move');
  if (stepMoves.length > 0) {
    const ids = stepMoves.map((o) => o.entityId!) as string[];
    await tx.pathwayStep.updateMany({
      where: { id: { in: ids } },
      data: { order: { increment: REORDER_OFFSET } },
    });
    for (const m of stepMoves) {
      await tx.pathwayStep.update({
        where: { id: m.entityId! },
        data: { order: m.after as number },
      });
    }
  }

  const stepUpdateGroups = new Map<string, Record<string, unknown>>();
  for (const op of by('steps', 'update')) {
    const id = op.entityId!;
    const cur = stepUpdateGroups.get(id) ?? {};
    cur[op.field!] = op.after;
    stepUpdateGroups.set(id, cur);
  }
  for (const [id, data] of stepUpdateGroups) {
    await tx.pathwayStep.update({ where: { id }, data });
  }

  const tempStepMap = new Map<string, string>();
  for (const op of by('steps', 'create')) {
    const snap = op.after as {
      title: string;
      description: string | null;
      learningObjective: string;
      prerequisites: string | null;
      expectedActivity: string;
      order: number;
    };
    const pathway = await tx.pathway.findUnique({
      where: { careerId },
      select: { id: true },
    });
    if (!pathway) {
      throw new DomainException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'PATHWAY_MISSING',
        'Pathway is required to create steps',
      );
    }
    const created = await tx.pathwayStep.create({
      data: {
        pathwayId: pathway.id,
        title: snap.title,
        description: snap.description,
        learningObjective: snap.learningObjective,
        prerequisites: snap.prerequisites,
        expectedActivity: snap.expectedActivity,
        order: snap.order,
      },
      select: { id: true },
    });
    if (op.entityId) {
      tempStepMap.set(op.entityId, created.id);
      createdIds.set(op.entityId, created.id);
    }
  }

  const resolveStepId = (id: string | undefined): string | undefined =>
    id && tempStepMap.get(id) ? tempStepMap.get(id) : id;

  // ── 6. Step skills / step resources
  for (const op of by('stepSkills', 'link')) {
    const stepId = resolveStepId(op.parentId);
    if (!stepId) continue;
    await tx.pathwayStepSkill.create({
      data: { pathwayStepId: stepId, skillId: op.entityId! },
    });
  }
  for (const op of by('stepSkills', 'unlink')) {
    const stepId = resolveStepId(op.parentId);
    if (!stepId) continue;
    await tx.pathwayStepSkill.delete({
      where: {
        pathwayStepId_skillId: {
          pathwayStepId: stepId,
          skillId: op.entityId!,
        },
      },
    });
  }
  for (const op of by('stepResources', 'link')) {
    const stepId = resolveStepId(op.parentId);
    const resourceId = resolveResourceId(op.entityId);
    if (!stepId || !resourceId) continue;
    await tx.pathwayStepResource.create({
      data: { pathwayStepId: stepId, resourceId },
    });
  }
  for (const op of by('stepResources', 'unlink')) {
    const stepId = resolveStepId(op.parentId);
    const resourceId = resolveResourceId(op.entityId);
    if (!stepId || !resourceId) continue;
    await tx.pathwayStepResource.delete({
      where: {
        pathwayStepId_resourceId: { pathwayStepId: stepId, resourceId },
      },
    });
  }

  // ── 7. Step deletes — AFTER step-link deletes so the count is accurate
  for (const op of by('steps', 'delete')) {
    await tx.pathwayStep.delete({ where: { id: op.entityId! } });
  }

  // ── 8. Resource unlinks — AFTER step-resource unlinks, so the count is accurate
  for (const op of by('resources', 'unlink')) {
    const stillReferenced = await tx.pathwayStepResource.count({
      where: { resourceId: op.entityId! },
    });
    if (stillReferenced === 0) {
      await tx.resource.delete({ where: { id: op.entityId! } });
    }
  }

  // ── 9. Pathway delete — after its steps were removed
  for (const op of by('pathway', 'delete')) {
    await tx.pathway.delete({ where: { id: op.entityId! } });
  }

  // ── 10. Career skills (link / update importance / unlink)
  for (const op of by('skills', 'link')) {
    const after = op.after as { skillId: string; importance: string };
    await tx.careerSkill.create({
      data: {
        careerId,
        skillId: after.skillId,
        importance: after.importance as never,
      },
    });
  }
  for (const op of by('skills', 'update')) {
    await tx.careerSkill.update({
      where: { careerId_skillId: { careerId, skillId: op.entityId! } },
      data: { importance: op.after as never },
    });
  }
  for (const op of by('skills', 'unlink')) {
    await tx.careerSkill.delete({
      where: { careerId_skillId: { careerId, skillId: op.entityId! } },
    });
  }

  // ── 11. Outlook: create / update / delete
  for (const op of by('outlook', 'create')) {
    const after = op.after as Record<string, unknown>;
    await tx.outlookData.create({ data: { careerId, ...after } as never });
  }
  for (const op of by('outlook', 'update')) {
    const after = op.after as Record<string, unknown>;
    await tx.outlookData.update({
      where: { id: op.entityId! },
      data: after as never,
    });
  }
  for (const op of by('outlook', 'delete')) {
    await tx.outlookData.delete({ where: { id: op.entityId! } });
  }

  return { createdIds };
}
