// ─────────────────────────────────────────────────────────────────────
// Phase A amendment (T0.5): the career aggregate no longer includes
// pathway, steps, resources, or outlook-as-its-own-root. This loader
// therefore no longer traverses `pathway → steps → resources`, and no
// longer gathers resource rows. Outlook still loads because outlook is
// still in the career aggregate for now (OUTLOOK is a later ticket).
// ─────────────────────────────────────────────────────────────────────

import type { Prisma } from '../../../generated/prisma/client';
import type { LiveCareerForPlan } from './career.types';

/**
 * Load a live career in the shape `plan` expects.
 *
 * MUST be called inside a transaction whose `tx` is passed in. The caller
 * (the publisher / session service) owns the transaction boundary.
 */
export async function loadLiveCareer(
  tx: Prisma.TransactionClient,
  careerId: string,
): Promise<LiveCareerForPlan | null> {
  const career = await tx.career.findUnique({
    where: { id: careerId },
    include: {
      skills: true,
    },
  });
  if (!career) return null;

  return {
    id: career.id,
    version: career.version,
    title: career.title,
    slug: career.slug,
    description: career.description,
    roleSummary: career.roleSummary,
    fieldId: career.fieldId,
    targetLevels: career.targetLevels,
    exampleActivities: career.exampleActivities,
    typicalEducationNote: career.typicalEducationNote,
    certificationsNote: career.certificationsNote,
    skills: career.skills.map((s) => ({
      skillId: s.skillId,
      importance: s.importance,
    })),
  };
}

/**
 * Lock the live career row so concurrent revisions and publishes on the same
 * career serialise.
 *
 * Lock order (per README §Locking order): strategy.lock first, then the
 * revision row. The session service calls this before locking the session's
 * revisions.
 */
export async function lockCareer(
  tx: Prisma.TransactionClient,
  careerId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Career" WHERE "id" = ${careerId} FOR UPDATE`;
}
