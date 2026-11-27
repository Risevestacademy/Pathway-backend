import type { Prisma } from '../../../generated/prisma/client';
import type {
  ApplyResult,
  ContentRef,
  DiffContext,
  PlanContext,
  RevisionPlan,
  RevisionStrategy,
  SectionChanges,
  TempIdField,
} from '../../envelope/strategy.types';
import { isRevisionStale } from '../../envelope/strategy.types';
import { applyPathwayPlan } from './pathway.apply';
import { PATHWAY_STRATEGY_FIELD_LABELS } from './pathway.config';
import { findSnapshotProblems } from './pathway.consistency';
import { pathwayDiffSections } from './pathway.diff';
import { loadLivePathway, lockPathway } from './pathway.live';
import { buildPathwayPlan } from './pathway.plan';
import type { LivePathwayForPlan, PathwaySnapshot } from './pathway.types';

/**
 * Owns the Pathway row (title, description) and nothing else. Stages, steps
 * and their ordering belong to other aggregates. Update-only: no moves, no
 * link-sets, no cross-aggregate writes.
 */
export class PathwayRevisionStrategy implements RevisionStrategy<PathwaySnapshot> {
  readonly contentType = 'PATHWAY' as const;
  readonly contentTypeLabel = 'Pathway';
  readonly sectionLabel = 'Pathway';
  readonly fieldLabels = PATHWAY_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: PathwaySnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LivePathwayForPlan | null> {
    return loadLivePathway(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockPathway(tx, contentId);
  }

  plan(
    live: LivePathwayForPlan | null,
    snapshot: PathwaySnapshot,
    _baseVersion: number,
    context?: PlanContext,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_NOT_FOUND',
            message: 'Pathway not found',
            section: 'pathway',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildPathwayPlan({ live, snapshot, context });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: PathwaySnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return pathwayDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LivePathwayForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyPathwayPlan(tx, plan, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    if (!entity || typeof entity !== 'object') return 'Unknown';
    const title = (entity as Record<string, unknown>).title;
    return typeof title === 'string' && title.length > 0 ? title : 'Unknown';
  }

  nestedRootsTouched(_plan: RevisionPlan): ContentRef[] {
    // When step reordering moves from the step strategy to the pathway
    // strategy (a later ticket), this returns ContentRef[] for each reordered
    // PATHWAY_STEP whose version the apply bumps. For now, step order is not
    // editable (see 7.1).
    return [];
  }
}
