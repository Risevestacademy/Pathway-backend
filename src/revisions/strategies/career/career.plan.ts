// ─────────────────────────────────────────────────────────────────────
//
// The career aggregate owns
// ONLY career-level fields plus its own skill link-set. Pathway, steps,
// resources, and outlook are each their own root. This file
// contains only:
//
//   - planCareerFields  (scalar/array comparison via config)
//   - planSkills        (the CareerSkill link-set; hand-written because
//                        `importance` makes the set comparison special)
//   - buildCareerPlan   (the entry point; calls the two above)
//
// `planPathway`, `planSteps`, `planResources`, `planOutlook`, and
// `pickOutlook` have been removed. Their strategies (or the still-deferred
// OUTLOOK ticket) own them.
//
// The generic comparison helpers now live in `envelope/field-compare.ts`.
// ─────────────────────────────────────────────────────────────────────

import type {
  CareerSnapshot,
  LiveCareerForPlan,
  PlanBlocker,
  PlanCounts,
  PlanOperation,
} from './career.types';
import { CAREER_FIELD_CONFIG } from './career.config';
import { compareFields, readField } from '../../envelope/field-compare';

// ─────────────────────────────────────────────────────────────────────
// Section planners
// ─────────────────────────────────────────────────────────────────────

/**
 * Career-level fields, with required-field blockers.
 *
 * The required check and the comparison both read `CAREER_FIELD_CONFIG`;
 * adding a field to the config adds it to both.
 */
function planCareerFields(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  const s = snapshot.career;

  for (const entry of CAREER_FIELD_CONFIG) {
    if (!entry.required) continue;
    const value = readField(s, entry.field);
    if (value === null || value === undefined || value === '') {
      blockers.push({
        code: 'MISSING_CAREER_FIELD',
        message: `Career field "${entry.field}" is required`,
        section: 'career',
        entityId: live.id,
      });
    }
  }

  compareFields(CAREER_FIELD_CONFIG, live, s, live.id, operations);
}

/**
 * Career skills (link-set with importance). Compares a
 * `{ skillId, importance }` map on both sides; emits `link` for additions,
 * `update` for importance changes, `unlink` for removals, and a `NO_SKILLS`
 * blocker when the snapshot is empty.
 *
 * Not config-driven: the extra `importance` payload makes the set
 * comparison special. It stays hand-written and well-commented.
 */
function planSkills(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  if (snapshot.skills.length === 0) {
    blockers.push({
      code: 'NO_SKILLS',
      message: 'Career must have at least one skill',
      section: 'skills',
    });
  }

  const liveSkills = new Map(live.skills.map((s) => [s.skillId, s.importance]));
  const snapSkills = new Map(
    snapshot.skills.map((s) => [s.skillId, s.importance]),
  );

  for (const [skillId, importance] of snapSkills) {
    const liveImportance = liveSkills.get(skillId);
    if (liveImportance === undefined) {
      operations.push({
        kind: 'link',
        section: 'skills',
        entityId: skillId,
        after: { skillId, importance },
      });
    } else if (liveImportance !== importance) {
      operations.push({
        kind: 'update',
        section: 'skills',
        entityId: skillId,
        field: 'importance',
        before: liveImportance,
        after: importance,
      });
    }
  }

  for (const skillId of liveSkills.keys()) {
    if (!snapSkills.has(skillId)) {
      operations.push({
        kind: 'unlink',
        section: 'skills',
        entityId: skillId,
        before: { skillId, importance: liveSkills.get(skillId) },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Top-level entry point
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the career revision plan.
 *
 * The career aggregate owns the `Career` row's scalar/array fields and its
 * `CareerSkill` link-set. It does not own pathway, steps, resources, or
 * outlook.
 */
export function buildCareerPlan(args: {
  liveCareer: LiveCareerForPlan;
  snapshot: CareerSnapshot;
  baseVersion: number;
}): {
  baseVersion: number;
  liveVersion: number;
  stale: boolean;
  operations: PlanOperation[];
  blockers: PlanBlocker[];
  counts: PlanCounts;
} {
  const { liveCareer, snapshot, baseVersion } = args;
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  planCareerFields(liveCareer, snapshot, operations, blockers);
  planSkills(liveCareer, snapshot, operations, blockers);

  return {
    baseVersion,
    liveVersion: liveCareer.version,
    stale: baseVersion < liveCareer.version,
    operations,
    blockers,
    counts: computeCounts(operations, blockers),
  };
}

function computeCounts(
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): PlanCounts {
  let added = 0;
  let changed = 0;
  let moved = 0;
  let removed = 0;

  for (const op of operations) {
    if (op.kind === 'create' || op.kind === 'link') added++;
    else if (op.kind === 'update') changed++;
    else if (op.kind === 'move') moved++;
    else if (op.kind === 'delete' || op.kind === 'unlink') removed++;
  }

  return { added, changed, moved, removed, blockers: blockers.length };
}
