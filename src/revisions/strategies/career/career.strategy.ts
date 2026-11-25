import type { Prisma } from '../../../generated/prisma/client';
import type {
  ApplyResult,
  ContentRef,
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
 * This is the reference implementation for every other strategy. It:
 *   - owns one content root (`CAREER`),
 *   - declares its temp-ID paths,
 *   - delegates to the config-driven plan builder, the consistency validator,
 *     the moved apply/live functions, and the adapter over the old diff
 *     formatter.
 *
 * The class holds a `PrismaService` for two reasons: `loadLive`/`lock`/`apply`
 * receive a `tx` from the caller and don't need it, but the `CareerDiffAdapter`
 * (which wraps the old `ReviewerDiffFormatter`) does, and the adapter's
 * constructor takes a `PrismaService`. Passing it through the strategy keeps
 * the adapter's dependency explicit.
 *
 * Tests: this class's behaviour is proven by the existing plan/apply/consistency
 * tests (which now go through the strategy's methods) and, from T0.5, by
 * `runStrategyConformanceTests`.
 */
export class CareerRevisionStrategy implements RevisionStrategy<CareerSnapshot> {
  readonly contentType = 'CAREER' as const;
  readonly contentTypeLabel = 'Career';
  readonly sectionLabel = 'Career Details';
  readonly fieldLabels = CAREER_STRATEGY_FIELD_LABELS;

  /**
   * Paths in `CareerSnapshot` where a `new-*` ID can appear.
   *
   * - `resources[].id` — a new resource created in this session.
   * - `steps[].id` — a new step created in this session.
   * - `steps[].resourceIds[]` — a step referencing a new resource.
   * - `outlook[].id` — a new outlook row created in this session.
   *
   * NOTE: `steps[].skillIds[]` is NOT a temp-ID path: skills are real rows,
   * never created in a career session. `career.fieldId` is a real `Field` row.
   */
  readonly tempIdFields: readonly TempIdField[] = [
    { path: 'resources[].id', kind: 'scalar' },
    { path: 'steps[].id', kind: 'scalar' },
    { path: 'steps[].resourceIds[]', kind: 'array' },
    { path: 'outlook[].id', kind: 'scalar' },
  ];

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
    // A career revision always has a live career to plan against — the career
    // itself exists even when the editor is creating it (the session's
    // contextId is a pre-allocated UUID, and the row exists as DRAFT). The
    // only case where `live` is null is a bug: the session service must have
    // created the career before opening the session. Guard loudly.
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
  ): Promise<SectionChanges[]> {
    return careerDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    live: LiveCareerForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applyCareerPlan(tx, plan, live, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    // A career snapshot-shaped entity has a `.career.title`; a step/outlook/
    // resource snapshot-shaped entity has a `.title`. The diff renderer only
    // calls `titleFor` with the operation's `before`/`after`, which for
    // career-level operations is the full `CareerSnapshot` (has `.career`),
    // and for nested entities is the entity itself (has `.title`).
    if (!entity || typeof entity !== 'object') return 'Unknown';
    const obj = entity as Record<string, unknown>;
    if (typeof obj.career === 'object' && obj.career !== null) {
      const c = obj.career as Record<string, unknown>;
      if (typeof c.title === 'string') return c.title;
    }
    if (typeof obj.title === 'string') return obj.title;
    return 'Unknown';
  }

  nestedRootsTouched(): ContentRef[] {
    return [];
  }
}
