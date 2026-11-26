import type { PlanOperation } from './strategy.types';

/**
 * A field descriptor for a content-type strategy. The strategy's `plan`,
 * `diff`, and `validate` all iterate these; adding a field is adding one entry.
 *
 * `kind` decides the comparison semantics:
 *
 * - `scalar`        — `!==` comparison (strings, booleans, nulls).
 * - `array`         — element-wise equality (`arraysEqual`).
 * - `decimal`       — normalize both sides with `.toString()`, then `!==`.
 *                     Handles Prisma `Decimal` on the live side and string on
 *                     the snapshot side. Also used for enum-like columns whose
 *                     runtime types differ (e.g. `Demand` vs `string`).
 * - `move`          — emits a `move` operation with `before: live.order`,
 *                     `after: snapshot.order`; the apply side uses the reorder
 *                     offset (see `apply`).
 * - `link-set`      — a set of `{ id }` references compared as a set; emits
 *                     `link`/`unlink` operations with `parentId`. Used for
 *                     many-to-many links where the IDs are always real.
 * - `temp-link-set` — same as `link-set`, but the snapshot side accepts
 *                     `new-*` temp IDs. Used for `resourceIds` (a resource can
 *                     be created in the same session as the step that uses it).
 *
 * `required: true` means an empty (null/undefined/'') value blocks submission.
 * The strategy emits a blocker with code `MISSING_<ENTITY>_FIELD` in
 * `plan`. The consistency validator uses the same flag for its structural
 * check; the two agree because they read the same config.
 */
export type FieldKind =
  'scalar' | 'array' | 'decimal' | 'move' | 'link-set' | 'temp-link-set';

export interface FieldConfigEntry {
  field: string;
  kind: FieldKind;
  label: string;
  section: PlanSection;
  required?: boolean;
  /**
   * For `link-set` / `temp-link-set`: the path in the live shape where the
   * set lives, and the path in the snapshot. E.g. `linkLive: 'skills'`,
   * `linkSnapshot: 'skillIds'`. The plan code reads the sets from these paths.
   */
  linkLive?: string;
  linkSnapshot?: string;
}

// `PlanSection` is imported below with the type import to keep the config
// type stable. See `envelope/strategy.types.ts`.
import type { PlanSection } from './strategy.types';

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

export const arraysEqual = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const readField = (source: unknown, field: string): unknown =>
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
export function compareFields(
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
      continue;
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
export function compareMove(
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
export function compareLinkSet(
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
// Derived label maps
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a `field → label` map from one or more configs. The diff renderer
 * reads this to label each `FieldChange`; the strategy exposes the merged
 * map as its `fieldLabels` property.
 */
export function labelsFrom(
  ...configs: readonly (readonly FieldConfigEntry[])[]
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const config of configs) {
    for (const entry of config) out[entry.field] = entry.label;
  }
  return out;
}
