import type {
  CareerSnapshot,
  CareerSnapshotOutlook,
  LiveCareerForPlan,
  LiveOutlook,
  PlanBlocker,
  PlanCounts,
  PlanOperation,
} from './career.types';
import {
  CAREER_FIELD_CONFIG,
  OUTLOOK_FIELD_CONFIG,
  PATHWAY_FIELD_CONFIG,
  RESOURCE_FIELD_CONFIG,
  STEP_FIELD_CONFIG,
  type FieldConfigEntry,
} from './career.config';

// ─────────────────────────────────────────────────────────────────────
// Shared comparison helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Normalize a value for `kind: 'decimal'` comparison. Prisma returns
 * `Decimal` objects for numeric columns; the snapshot side has strings.
 * Both sides normalise to a string (or null). Non-object values pass through.
 */
export const normalizeDecimal = (v: unknown): unknown =>
  v && typeof v === 'object' && 'toString' in v
    ? (v as { toString(): string }).toString()
    : v;

const arraysEqual = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const readField = (source: unknown, field: string): unknown =>
  (source as Record<string, unknown>)[field];

// ─────────────────────────────────────────────────────────────────────
// Generic field comparison
// ─────────────────────────────────────────────────────────────────────

/**
 * Compare a list of config entries between a live shape and a snapshot,
 * pushing `update` operations for scalar/array/decimal changes.
 *
 * This is the interpreter that replaces the three near-identical loops in the
 * old `planCareerFields`. It is driven entirely by the config; the only
 * per-kind logic is the `switch`.
 */
function compareFields(
  config: readonly FieldConfigEntry[],
  live: unknown,
  snapshot: unknown,
  defaultEntityId: string | undefined,
  operations: PlanOperation[],
): void {
  for (const entry of config) {
    if (
      entry.kind === 'move' ||
      entry.kind === 'link-set' ||
      entry.kind === 'temp-link-set'
    ) {
      continue; // handled by their own interpreters
    }

    const before = readField(live, entry.field);
    const after = readField(snapshot, entry.field);

    const equal =
      entry.kind === 'array'
        ? arraysEqual(before as unknown[], after as unknown[])
        : entry.kind === 'decimal'
          ? normalizeDecimal(before) === normalizeDecimal(after)
          : before === after;

    if (!equal) {
      operations.push({
        kind: 'update',
        section: entry.section,
        entityId: defaultEntityId,
        field: entry.field,
        before,
        after,
      });
    }
  }
}

/**
 * Emit a `move` operation for a config entry of kind `move`. `entityId` is
 * required (the thing being moved).
 */
function compareMove(
  entry: FieldConfigEntry,
  live: unknown,
  snapshot: unknown,
  entityId: string,
  operations: PlanOperation[],
): void {
  const before = readField(live, entry.field) as number;
  const after = readField(snapshot, entry.field) as number;
  if (before !== after) {
    operations.push({
      kind: 'move',
      section: entry.section,
      entityId,
      field: entry.field,
      before,
      after,
    });
  }
}

/**
 * Emit `link`/`unlink` operations for a set comparison. `linkLive` names the
 * live field holding `{ [idKey]: string }[]`; `linkSnapshot` names the
 * snapshot field holding `string[]` or `EntityRef[]`. `allowTemp` permits
 * `new-*` IDs on the snapshot side (the resulting `unlink` for a temp ID is
 * nonsense, so only links are emitted for temp IDs — an unlink of a not-yet-
 * created row cannot happen).
 */
function compareLinkSet(
  entry: FieldConfigEntry,
  live: unknown,
  snapshot: unknown,
  parentId: string,
  operations: PlanOperation[],
  allowTemp: boolean,
): void {
  const liveArr = (readField(live, entry.linkLive!) ?? []) as Array<
    Record<string, unknown>
  >;
  const snapArr = (readField(snapshot, entry.linkSnapshot!) ?? []) as string[];

  // Live and snapshot both represent a set of IDs; the live shape nests the
  // ID under the relation's FK name (e.g. `{ skillId: 'abc' }`). Derive the
  // FK key from the snapshot field name by stripping a trailing 's' (the
  // plural convention) — the current schema names them `skillId`,
  // `resourceId`, matching `skillIds` and `resourceIds`.
  const fkKey = entry.linkSnapshot!.endsWith('s')
    ? entry.linkSnapshot!.slice(0, -1)
    : entry.linkSnapshot!;

  const liveIds = new Set(
    liveArr.map((r) => r[fkKey] as string).filter(Boolean),
  );
  const snapIds = new Set(snapArr);

  for (const id of snapIds) {
    if (liveIds.has(id)) continue;
    if (!allowTemp && id.startsWith('new-')) {
      // A `link-set` should never see a temp ID. Throw loudly so a strategy
      // author who picked the wrong kind finds out immediately.
      throw new Error(
        `compareLinkSet: temp id "${id}" in a non-temp link-set (${entry.field})`,
      );
    }
    operations.push({
      kind: 'link',
      section: entry.section,
      entityId: id,
      parentId,
    });
  }

  for (const id of liveIds) {
    if (snapIds.has(id)) continue;
    operations.push({
      kind: 'unlink',
      section: entry.section,
      entityId: id,
      parentId,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Section planners
// ─────────────────────────────────────────────────────────────────────

/**
 * Career-level fields, with required-field blockers.
 *
 * Behaviour-preserving rewrite of `planCareerFields`. The required check and
 * the comparison both read `CAREER_FIELD_CONFIG`; adding a field to the
 * config adds it to both.
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
 * Pathway create / delete / update. The create and delete branches are
 * structural; the update branch uses `PATHWAY_FIELD_CONFIG`.
 */
function planPathway(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const s = snapshot.pathway;
  const l = live.pathway;

  if (!s && !l) return;

  if (!l && s) {
    operations.push({ kind: 'create', section: 'pathway', after: s });
    return;
  }

  if (l && !s) {
    operations.push({
      kind: 'delete',
      section: 'pathway',
      entityId: l.id,
      before: l,
    });
    return;
  }

  compareFields(PATHWAY_FIELD_CONFIG, l, s, l!.id, operations);
}

/**
 * Career skills (link-set with importance). This is unchanged from the old
 * `planSkills`: it compares a `{ skillId, importance }` map on both sides,
 * emits `link` for additions, `update` for importance changes, `unlink` for
 * removals, and a `NO_SKILLS` blocker when the snapshot is empty.
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

/**
 * Resource updates and unlinks. Temp-id creates are handled separately (a
 * `new-*` resource is a create, not a field comparison). Existing resources
 * are compared field-by-field via `RESOURCE_FIELD_CONFIG`.
 */
function planResources(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const liveResources = new Map(live.resources.map((r) => [r.id, r]));
  const snapResources = new Map(
    snapshot.resources
      .filter((r) => !r.id.startsWith('new-'))
      .map((r) => [r.id, r]),
  );

  for (const [id, snap] of snapResources) {
    const l = liveResources.get(id);
    if (!l) {
      operations.push({
        kind: 'link',
        section: 'resources',
        entityId: id,
        after: snap,
      });
      continue;
    }

    // Compare via the config. Collect into a temp operations array, then
    // wrap: a resource update is one operation carrying before/after, not
    // one per field (the apply side writes the whole row). This preserves
    // the old shape.
    const tempOps: PlanOperation[] = [];
    compareFields(RESOURCE_FIELD_CONFIG, l, snap, id, tempOps);
    if (tempOps.length > 0) {
      operations.push({
        kind: 'update',
        section: 'resources',
        entityId: id,
        before: l,
        after: snap,
      });
    }
  }

  for (const id of liveResources.keys()) {
    if (!snapResources.has(id)) {
      operations.push({
        kind: 'unlink',
        section: 'resources',
        entityId: id,
        before: liveResources.get(id),
      });
    }
  }

  for (const snap of snapshot.resources) {
    if (snap.id.startsWith('new-')) {
      operations.push({
        kind: 'create',
        section: 'resources',
        entityId: snap.id,
        after: snap,
      });
    }
  }
}

/**
 * Outlook create / update / delete. Existing outlook rows are compared via
 * `OUTLOOK_FIELD_CONFIG` with `kind: 'decimal'`; a single `update` operation
 * carries the whole before/after (that is the old shape, preserved).
 */
function planOutlook(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const liveById = new Map(live.outlook.map((o) => [o.id, o]));
  const snapById = new Map(
    snapshot.outlook
      .filter((o) => !o.id.startsWith('new-'))
      .map((o) => [o.id, o]),
  );

  for (const [id, snap] of snapById) {
    const l = liveById.get(id);
    if (!l) {
      operations.push({
        kind: 'create',
        section: 'outlook',
        entityId: id,
        after: snap,
      });
      continue;
    }

    const tempOps: PlanOperation[] = [];
    compareFields(OUTLOOK_FIELD_CONFIG, l, snap, id, tempOps);
    if (tempOps.length > 0) {
      operations.push({
        kind: 'update',
        section: 'outlook',
        entityId: id,
        before: pickOutlook(l),
        after: pickOutlook(snap),
      });
    }
  }

  for (const id of liveById.keys()) {
    if (!snapById.has(id)) {
      operations.push({
        kind: 'delete',
        section: 'outlook',
        entityId: id,
        before: liveById.get(id),
      });
    }
  }

  for (const snap of snapshot.outlook) {
    if (snap.id.startsWith('new-')) {
      operations.push({
        kind: 'create',
        section: 'outlook',
        entityId: snap.id,
        after: snap,
      });
    }
  }
}

/**
 * Pick only the compared fields from an outlook row, normalising decimals.
 * Used by the diff renderer to render one change list for the whole row.
 */
function pickOutlook(
  source: LiveOutlook | CareerSnapshotOutlook,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of OUTLOOK_FIELD_CONFIG) {
    out[entry.field] = normalizeDecimal(readField(source, entry.field));
  }
  return out;
}

/**
 * Steps: create / update / move / delete, plus link sets. Field comparison
 * via `STEP_FIELD_CONFIG`; `order` uses `kind: 'move'`; skill and resource
 * links use the link-set interpreters.
 */
function planSteps(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
  learners: Record<string, number>,
): void {
  if (snapshot.steps.length === 0) {
    blockers.push({
      code: 'NO_PATHWAY_STEPS',
      message: 'Career must have at least one pathway step',
      section: 'steps',
    });
  }

  const liveById = new Map(live.steps.map((s) => [s.id, s]));
  const snapById = new Map(
    snapshot.steps
      .filter((s) => !s.id.startsWith('new-'))
      .map((s) => [s.id, s]),
  );

  for (const [id, snap] of snapById) {
    const l = liveById.get(id);
    if (!l) {
      operations.push({
        kind: 'create',
        section: 'steps',
        entityId: id,
        after: snap,
      });
      continue;
    }

    compareFields(STEP_FIELD_CONFIG, l, snap, id, operations);

    for (const entry of STEP_FIELD_CONFIG) {
      if (entry.kind === 'move') {
        compareMove(entry, l, snap, id, operations);
      } else if (entry.kind === 'link-set') {
        compareLinkSet(entry, l, snap, id, operations, false);
      } else if (entry.kind === 'temp-link-set') {
        compareLinkSet(entry, l, snap, id, operations, true);
      }
    }
  }

  for (const [id, l] of liveById) {
    if (snapById.has(id)) continue;
    const affected = learners[id] ?? 0;
    if (affected > 0) {
      blockers.push({
        code: 'STEP_HAS_PROGRESS',
        message: `Cannot remove step "${l.title}" — ${affected} learner${affected === 1 ? '' : 's'} affected`,
        section: 'steps',
        entityId: id,
        entityTitle: l.title,
        learnersAffected: affected,
      });
    } else {
      operations.push({
        kind: 'delete',
        section: 'steps',
        entityId: id,
        before: l,
      });
    }
  }

  for (const snap of snapshot.steps) {
    if (snap.id.startsWith('new-')) {
      operations.push({
        kind: 'create',
        section: 'steps',
        entityId: snap.id,
        after: snap,
      });
      // Emit link operations for a newly-created step's skills/resources.
      // Use an empty live shape so every snapshot ID is a `link`.
      for (const entry of STEP_FIELD_CONFIG) {
        if (entry.kind === 'link-set') {
          compareLinkSet(
            entry,
            { [entry.linkLive!]: [] },
            snap,
            snap.id,
            operations,
            false,
          );
        } else if (entry.kind === 'temp-link-set') {
          compareLinkSet(
            entry,
            { [entry.linkLive!]: [] },
            snap,
            snap.id,
            operations,
            true,
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Top-level entry point
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the career revision plan. Signature and output are identical to the
 * old `buildPlan`; only the internals are config-driven. Existing plan tests
 * must pass unchanged.
 */
export function buildCareerPlan(args: {
  liveCareer: LiveCareerForPlan;
  snapshot: CareerSnapshot;
  baseVersion: number;
  stepLearnerCounts?: Record<string, number>;
}): {
  baseVersion: number;
  liveVersion: number;
  stale: boolean;
  operations: PlanOperation[];
  blockers: PlanBlocker[];
  counts: PlanCounts;
} {
  const { liveCareer, snapshot, baseVersion, stepLearnerCounts = {} } = args;
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  planCareerFields(liveCareer, snapshot, operations, blockers);
  planPathway(liveCareer, snapshot, operations);
  planSkills(liveCareer, snapshot, operations, blockers);
  planResources(liveCareer, snapshot, operations);
  planOutlook(liveCareer, snapshot, operations);
  planSteps(liveCareer, snapshot, operations, blockers, stepLearnerCounts);

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
