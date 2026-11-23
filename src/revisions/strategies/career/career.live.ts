import type { Prisma } from '../../../generated/prisma/client';
import type { LiveCareerForPlan } from './career.types';

/**
 * Load a live career in the shape `plan` expects.
 *
 * This is the moved `loadLiveCareerForPlan` from the old
 * `content-revisions.service.ts` (it was a private method there). The old
 * service still has its own copy, the duplication is
 * intentional.
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
      outlook: true,
      pathway: {
        include: {
          steps: {
            include: {
              skills: { select: { skillId: true } },
              resources: { select: { resourceId: true } },
            },
          },
        },
      },
    },
  });
  if (!career) return null;

  const resourceIds = new Set<string>();
  for (const step of career.pathway?.steps ?? [])
    for (const r of step.resources) resourceIds.add(r.resourceId);

  const resources =
    resourceIds.size > 0
      ? await tx.resource.findMany({ where: { id: { in: [...resourceIds] } } })
      : [];

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
    outlook: career.outlook,
    pathway: career.pathway
      ? {
          id: career.pathway.id,
          title: career.pathway.title,
          description: career.pathway.description,
        }
      : null,
    steps: (career.pathway?.steps ?? []).map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      description: s.description,
      learningObjective: s.learningObjective,
      prerequisites: s.prerequisites,
      expectedActivity: s.expectedActivity,
      skills: s.skills.map((sk) => ({ skillId: sk.skillId })),
      resources: s.resources.map((r) => ({ resourceId: r.resourceId })),
    })),
    resources: resources.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      url: r.url,
      type: r.type,
      provider: r.provider,
      costStatus: r.costStatus,
      certificationCost: r.certificationCost,
      curationRationale: r.curationRationale,
      lastCheckedDate: r.lastCheckedDate,
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
