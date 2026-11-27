import type { Prisma } from '../../../generated/prisma/client';
import type {
  ApplyResult,
  ContentRef,
  DiffContext,
  RevisionPlan,
  RevisionStrategy,
  SectionChanges,
  TempIdField,
} from '../../envelope/strategy.types';
import { isRevisionStale } from '../../envelope/strategy.types';
import { applyStepPlan } from './pathway-step.apply';
import { PATHWAY_STEP_STRATEGY_FIELD_LABELS } from './pathway-step.config';
import { findSnapshotProblems } from './pathway-step.consistency';
import { stepDiffSections } from './pathway-step.diff';
import { loadLivePathwayStep, lockPathwayStep } from './pathway-step.live';
import { buildStepPlan } from './pathway-step.plan';
import type {
  LivePathwayStepForPlan,
  PathwayStepSnapshot,
} from './pathway-step.types';

/**
 * Owns the PathwayStep row, its skillIds[] link-set and its resourceIds[]
 * link-set. It does not own PathwayStepTask (PATHWAY_STEP_TASK), Pathway,
 * PathwayStage, Skill or Resource. Order is not editable; a changed order is a
 * plan blocker.
 */
export class PathwayStepRevisionStrategy implements RevisionStrategy<PathwayStepSnapshot> {
  readonly contentType = 'PATHWAY_STEP' as const;
  readonly contentTypeLabel = 'Pathway Step';
  readonly sectionLabel = 'Pathway Steps';
  readonly fieldLabels = PATHWAY_STEP_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: PathwayStepSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LivePathwayStepForPlan | null> {
    return loadLivePathwayStep(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockPathwayStep(tx, contentId);
  }

  plan(
    live: LivePathwayStepForPlan | null,
    snapshot: PathwayStepSnapshot,
    _baseVersion: number,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_STEP_NOT_FOUND',
            message: 'Pathway step not found',
            section: 'steps',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildStepPlan({ live, snapshot });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: PathwayStepSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return stepDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LivePathwayStepForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyStepPlan(tx, plan, contentId);
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
    // The step's own publish event is enough. Step ordering is not edited here
    // (it will live on the pathway revision), so no other root is touched.
    return [];
  }
}
