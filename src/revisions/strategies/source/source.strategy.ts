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
import { applySourcePlan } from './source.apply';
import { SOURCE_STRATEGY_FIELD_LABELS } from './source.config';
import { findSnapshotProblems } from './source.consistency';
import { sourceDiffSections } from './source.diff';
import { loadLiveSource, lockSource } from './source.live';
import { buildSourcePlan } from './source.plan';
import type { LiveSourceForPlan, SourceSnapshot } from './source.types';

export class SourceRevisionStrategy implements RevisionStrategy<SourceSnapshot> {
  readonly contentType = 'SOURCE' as const;
  readonly contentTypeLabel = 'Source';
  readonly sectionLabel = 'Sources';
  readonly fieldLabels = SOURCE_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: SourceSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LiveSourceForPlan | null> {
    return loadLiveSource(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockSource(tx, contentId);
  }

  plan(
    live: LiveSourceForPlan | null,
    snapshot: SourceSnapshot,
    _baseVersion: number,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'SOURCE_NOT_FOUND',
            message: 'Source not found',
            section: 'sources',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildSourcePlan({ live, snapshot });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: SourceSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return sourceDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LiveSourceForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applySourcePlan(tx, plan, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    if (!entity || typeof entity !== 'object') return 'Unknown';
    const name = (entity as Record<string, unknown>).name;
    return typeof name === 'string' && name.length > 0 ? name : 'Unknown';
  }

  nestedRootsTouched(_plan: RevisionPlan): ContentRef[] {
    return [];
  }
}
