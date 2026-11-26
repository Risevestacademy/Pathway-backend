// ─────────────────────────────────────────────────────────────────────
//
// The career aggregate owns only the `Career` row's scalar/array fields and
// its `CareerSkill` link-set. This apply handles exactly:
//
//   - career field updates          (section 'career',  kind 'update')
//   - career skill link/update/unlink (section 'skills', kinds 'link' /
//                                     'update' / 'unlink')
// ─────────────────────────────────────────────────────────────────────

import type { Prisma } from '../../../generated/prisma/client';
import type { RevisionPlan, ApplyResult } from '../../envelope/strategy.types';

export async function applyCareerPlan(
  tx: Prisma.TransactionClient,
  plan: RevisionPlan,
  careerId: string,
): Promise<ApplyResult> {
  const createdIds = new Map<string, string>();

  const by = (section: string, ...kinds: string[]) =>
    plan.operations.filter(
      (o) => o.section === section && kinds.includes(o.kind),
    );

  // ── 1. Career field updates (grouped by field — one update)
  const careerUpdates = by('career', 'update');
  if (careerUpdates.length > 0) {
    const data: Record<string, unknown> = {};
    for (const op of careerUpdates) data[op.field!] = op.after;
    await tx.career.update({ where: { id: careerId }, data });
  }

  // ── 2. Career skills (link / update importance / unlink)
  //
  // `CareerSkill` is a join row (`careerId`, `skillId`, `importance`). The
  // `Skill` row itself (name/description) is a separate content root owned
  // by the SKILL strategy — this apply never writes to `Skill`.
  for (const op of by('skills', 'link')) {
    const after = op.after as { skillId: string; importance: string };
    await tx.careerSkill.create({
      data: {
        careerId,
        skillId: op.entityId!,
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

  // ── 3. Outlook: create / update / delete
  //
  // Outlook still lives in the career aggregate in T0.5 (per the brief;
  // the OUTLOOK strategy is a later ticket). These three blocks are the
  // only surviving non-career, non-skill writes, and they will move out
  // when OUTLOOK gets its own strategy.
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
