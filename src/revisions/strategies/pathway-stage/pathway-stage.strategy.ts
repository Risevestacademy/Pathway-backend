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
import { applyStagePlan } from './pathway-stage.apply';
import { PATHWAY_STAGE_STRATEGY_FIELD_LABELS } from './pathway-stage.config';
import { findSnapshotProblems } from './pathway-stage.consistency';
import { stageDiffSections } from './pathway-stage.diff';
import { loadLivePathwayStage, lockPathwayStage } from './pathway-stage.live';
import { buildStagePlan } from './pathway-stage.plan';
import type {
  LivePathwayStageForPlan,
  PathwayStageSnapshot,
} from './pathway-stage.types';

/**
 * Owns the stage row (title, description). It does not own the stage's steps
 * (PATHWAY_STEP) or its quiz (QuizQuestion rows belong to QUIZ_QUESTION).
 * `pathwayId` is the parent FK, set at session open and not editable. `order`
 * is not editable either; a changed order is a plan blocker.
 */
export class PathwayStageRevisionStrategy implements RevisionStrategy<PathwayStageSnapshot> {
  readonly contentType = 'PATHWAY_STAGE' as const;
  readonly contentTypeLabel = 'Pathway Stage';
  readonly sectionLabel = 'Pathway Stages';
  readonly fieldLabels = PATHWAY_STAGE_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: PathwayStageSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LivePathwayStageForPlan | null> {
    return loadLivePathwayStage(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockPathwayStage(tx, contentId);
  }

  plan(
    live: LivePathwayStageForPlan | null,
    snapshot: PathwayStageSnapshot,
    _baseVersion: number,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_STAGE_NOT_FOUND',
            message: 'Pathway stage not found',
            section: 'stages',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildStagePlan({ live, snapshot });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: PathwayStageSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return stageDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LivePathwayStageForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyStagePlan(tx, plan, contentId);
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
    return [];
  }
}
