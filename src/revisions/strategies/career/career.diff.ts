import type {
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import type { CareerSnapshot } from './career.types';
import type { Prisma } from '../../../generated/prisma/client';
import { ReviewerDiffFormatter } from '../../../catalog/content-revisions/reviewer-diff.formatter';

/**
 * Adapter between the new `RevisionStrategy.diff` contract and the existing
 * `ReviewerDiffFormatter` in the old module. See T0.3 notes in ARCHITECTURE.
 *
 * Takes a Prisma client per call (the `buildDiff` transaction's `tx`) rather
 * than a constructor-injected `PrismaService`, because the formatter's
 * `resolveSourceLabels` must see the same transaction's view of `Source` rows
 * as the rest of the diff generation.
 */
export async function careerDiffSections(
  revisionId: string,
  plan: RevisionPlan,
  snapshot: CareerSnapshot,
  baseVersion: number,
  liveVersion: number,
  prisma: Prisma.TransactionClient,
): Promise<SectionChanges[]> {
  const formatter = new ReviewerDiffFormatter(prisma as never);
  const dto = await formatter.format(
    revisionId,
    {
      ...plan,
      baseVersion,
      liveVersion,
      counts: {
        added: 0,
        changed: 0,
        moved: 0,
        removed: 0,
        blockers: plan.blockers.length,
      },
    } as never,
    snapshot,
    { title: '', authorName: '', createdAt: new Date() },
  );

  return dto.sections as unknown as SectionChanges[];
}
