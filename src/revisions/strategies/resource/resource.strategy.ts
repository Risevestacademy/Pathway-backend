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
import { applyResourcePlan } from './resource.apply';
import { RESOURCE_STRATEGY_FIELD_LABELS } from './resource.config';
import { findSnapshotProblems } from './resource.consistency';
import { resourceDiffSections } from './resource.diff';
import { loadLiveResource, lockResource } from './resource.live';
import { buildResourcePlan } from './resource.plan';
import type { LiveResourceForPlan, ResourceSnapshot } from './resource.types';

export class ResourceRevisionStrategy implements RevisionStrategy<ResourceSnapshot> {
  readonly contentType = 'RESOURCE' as const;
  readonly contentTypeLabel = 'Resource';
  readonly sectionLabel = 'Resources';
  readonly fieldLabels = RESOURCE_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: ResourceSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LiveResourceForPlan | null> {
    return loadLiveResource(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockResource(tx, contentId);
  }

  plan(
    live: LiveResourceForPlan | null,
    snapshot: ResourceSnapshot,
    _baseVersion: number,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found',
            section: 'resources',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildResourcePlan({ live, snapshot });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: ResourceSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return resourceDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LiveResourceForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyResourcePlan(tx, plan, contentId);
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
