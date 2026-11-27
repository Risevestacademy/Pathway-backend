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
import { applyOutlookPlan } from './outlook.apply';
import { OUTLOOK_STRATEGY_FIELD_LABELS } from './outlook.config';
import { findSnapshotProblems } from './outlook.consistency';
import { outlookDiffSections } from './outlook.diff';
import { loadLiveOutlook, lockOutlook } from './outlook.live';
import { buildOutlookPlan } from './outlook.plan';
import { outlookTitle } from './outlook.title';
import type { LiveOutlookForPlan, OutlookSnapshot } from './outlook.types';

export class OutlookRevisionStrategy implements RevisionStrategy<OutlookSnapshot> {
  readonly contentType = 'OUTLOOK' as const;
  readonly contentTypeLabel = 'Outlook';
  readonly sectionLabel = 'Outlook';
  readonly fieldLabels = OUTLOOK_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: OutlookSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LiveOutlookForPlan | null> {
    return loadLiveOutlook(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockOutlook(tx, contentId);
  }

  plan(
    live: LiveOutlookForPlan | null,
    snapshot: OutlookSnapshot,
    _baseVersion: number,
    context?: PlanContext,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'OUTLOOK_NOT_FOUND',
            message: 'Outlook not found',
            section: 'outlook',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildOutlookPlan({
      live,
      snapshot,
      careerId: context?.careerId,
    });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: OutlookSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return outlookDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LiveOutlookForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyOutlookPlan(tx, plan, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    return outlookTitle(entity, 'Unknown');
  }

  nestedRootsTouched(_plan: RevisionPlan): ContentRef[] {
    return [];
  }
}
