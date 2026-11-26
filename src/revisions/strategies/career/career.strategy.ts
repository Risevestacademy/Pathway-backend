// ─────────────────────────────────────────────────────────────────────
// Phase A amendment (T0.5): the career strategy owns exactly one root
// (`CAREER`) plus its `CareerSkill` link-set. No temp IDs (no creates in
// this strategy), no nested roots touched. `applyCareerPlan` no longer
// takes `live` (nothing in the apply re-reads the live shape), so the
// call site drops it.
// ─────────────────────────────────────────────────────────────────────

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
import type { CareerSnapshot, LiveCareerForPlan } from './career.types';
import { buildCareerPlan } from './career.plan';
import { findSnapshotProblems } from './career.consistency';
import { applyCareerPlan } from './career.apply';
import { loadLiveCareer, lockCareer } from './career.live';
import { careerDiffSections } from './career.diff';
import { CAREER_STRATEGY_FIELD_LABELS } from './career.config';

/**
 * The career revision strategy.
 *
 * This is the reference implementation for every other strategy. It owns
 * one content root (`CAREER`) plus its `CareerSkill` link-set, declares no
 * temp-ID paths (it creates no rows), and delegates to the config-driven
 * plan builder, the consistency validator, the apply function, the live
 * loader, and the diff renderer.
 */
export class CareerRevisionStrategy implements RevisionStrategy<CareerSnapshot> {
  readonly contentType = 'CAREER' as const;
  readonly contentTypeLabel = 'Career';
  readonly sectionLabel = 'Career Details';
  readonly fieldLabels = CAREER_STRATEGY_FIELD_LABELS;

  /**
   * No temp-ID paths. A career snapshot contains only real IDs:
   * `career.fieldId` is a real `Field` row, and `skills[].skillId` is a
   * real `Skill` row (skills are created via the SKILL strategy, not in a
   * career session). The career strategy creates no rows, so it can never
   * introduce a `new-*` ID.
   */
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: CareerSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LiveCareerForPlan | null> {
    return loadLiveCareer(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockCareer(tx, contentId);
  }

  plan(
    live: LiveCareerForPlan | null,
    snapshot: CareerSnapshot,
    baseVersion: number,
  ): RevisionPlan {
    // A career revision always has a live career to plan against — the
    // career itself exists even when the editor is creating it (the
    // session's contextId is a pre-allocated UUID, and the row exists as
    // DRAFT). The only case where `live` is null is a bug: the session
    // service must have created the career before opening a session
    // against it. Guard loudly.
    if (!live) {
      throw new Error(
        'CareerRevisionStrategy.plan: live career is null. The session ' +
          'service must create the career before opening a session against it.',
      );
    }

    const built = buildCareerPlan({
      liveCareer: live,
      snapshot,
      baseVersion,
    });

    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: built.stale,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: CareerSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return careerDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LiveCareerForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyCareerPlan(tx, plan, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    // A career snapshot-shaped entity has a `.career.title`; an entity-
    // shaped snapshot (e.g. a future pathway or outlook snapshot) has a
    // `.title`. Anything else falls back to 'Unknown'.
    if (!entity || typeof entity !== 'object') return 'Unknown';
    const obj = entity as Record<string, unknown>;
    if (typeof obj.career === 'object' && obj.career !== null) {
      const c = obj.career as Record<string, unknown>;
      if (typeof c.title === 'string') return c.title;
    }
    if (typeof obj.title === 'string') return obj.title;
    return 'Unknown';
  }

  nestedRootsTouched(_plan: RevisionPlan): ContentRef[] {
    // The career strategy owns exactly one root (`CAREER`). When the career
    // plan publishes, its own publish event bumps the CAREER version — the
    // strategy does not need to declare any nested root.
    return [];
  }
}
