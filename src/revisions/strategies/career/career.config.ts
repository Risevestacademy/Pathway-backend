import type { PlanSection } from '../../strategy.types';

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

// ─────────────────────────────────────────────────────────────────────
// Career-level fields
// ─────────────────────────────────────────────────────────────────────

/**
 * Scalar and array fields on `Career` itself. The `section` is always
 * `'career'`.
 *
 * Adding a field to `Career`:
 *   1. Add the column in `schema.prisma` and migrate.
 *   2. Add the field to `CareerSnapshotCareer` and `LiveCareerForPlan`.
 *   3. Add one entry below.
 *   4. Add the label to `FIELD_LABELS` (derived from this config).
 *
 * No changes to `plan`, `apply`, or `diff`. That is the config contract.
 */
export const CAREER_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'title',
    kind: 'scalar',
    section: 'career',
    label: 'Title',
    required: true,
  },
  {
    field: 'slug',
    kind: 'scalar',
    section: 'career',
    label: 'Slug',
    required: true,
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'career',
    label: 'Description',
    required: true,
  },
  {
    field: 'roleSummary',
    kind: 'scalar',
    section: 'career',
    label: 'Role Summary',
    required: true,
  },
  {
    field: 'fieldId',
    kind: 'scalar',
    section: 'career',
    label: 'Category',
    required: true,
  },
  {
    field: 'typicalEducationNote',
    kind: 'scalar',
    section: 'career',
    label: 'Typical Education',
  },
  {
    field: 'certificationsNote',
    kind: 'scalar',
    section: 'career',
    label: 'Certifications',
  },
  {
    field: 'targetLevels',
    kind: 'array',
    section: 'career',
    label: 'Target Levels',
  },
  {
    field: 'exampleActivities',
    kind: 'array',
    section: 'career',
    label: 'Example Activities',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Pathway (a single nested object on the career)
// ─────────────────────────────────────────────────────────────────────

/**
 * Pathway is its own section but not a collection; planPathway handles the
 * create/delete/update branches. The config lists its comparable scalar
 * fields, used only when both sides exist.
 */
export const PATHWAY_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  { field: 'title', kind: 'scalar', section: 'pathway', label: 'Title' },
  {
    field: 'description',
    kind: 'scalar',
    section: 'pathway',
    label: 'Description',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────

/**
 * Step fields. `order` uses `kind: 'move'` because the apply side reorders
 * with an offset; `skillIds`/`resourceIds` are link sets because they map to
 * join tables. `resourceIds` is `temp-link-set` because a step can reference
 * a `new-*` resource created in the same session.
 */
export const STEP_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  { field: 'title', kind: 'scalar', section: 'steps', label: 'Title' },
  {
    field: 'description',
    kind: 'scalar',
    section: 'steps',
    label: 'Description',
  },
  {
    field: 'learningObjective',
    kind: 'scalar',
    section: 'steps',
    label: 'Learning Objective',
  },
  {
    field: 'prerequisites',
    kind: 'scalar',
    section: 'steps',
    label: 'Prerequisites',
  },
  {
    field: 'expectedActivity',
    kind: 'scalar',
    section: 'steps',
    label: 'Expected Activity',
  },
  { field: 'order', kind: 'move', section: 'steps', label: 'Position' },
  {
    field: 'skillIds',
    kind: 'link-set',
    section: 'stepSkills',
    label: 'Skills',
    linkLive: 'skills',
    linkSnapshot: 'skillIds',
  },
  {
    field: 'resourceIds',
    kind: 'temp-link-set',
    section: 'stepResources',
    label: 'Resources',
    linkLive: 'resources',
    linkSnapshot: 'resourceIds',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Outlook
// ─────────────────────────────────────────────────────────────────────

/**
 * Every outlook field is `kind: 'decimal'`. The normaliser handles Prisma
 * `Decimal`, string, number, and enum-valued columns uniformly: it calls
 * `.toString()` on anything object-shaped and compares with `!==`. That is
 * exactly what `outlookChanges` / `pickOutlook` do today, so this config
 * preserves current behaviour without change.
 *
 * Adding an outlook field:
 *   1. Schema column + migration.
 *   2. Add to `CareerSnapshotOutlook` and `LiveOutlook`.
 *   3. Add one entry below.
 *   4. The label goes into the diff automatically.
 */
export const OUTLOOK_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  { field: 'type', kind: 'decimal', section: 'outlook', label: 'Outlook Type' },
  {
    field: 'geography',
    kind: 'decimal',
    section: 'outlook',
    label: 'Geography',
  },
  { field: 'period', kind: 'decimal', section: 'outlook', label: 'Period' },
  { field: 'sourceId', kind: 'decimal', section: 'outlook', label: 'Source' },
  {
    field: 'median',
    kind: 'decimal',
    section: 'outlook',
    label: 'Typical Starting Salary',
  },
  {
    field: 'percentile25',
    kind: 'decimal',
    section: 'outlook',
    label: '25th Percentile',
  },
  {
    field: 'percentile75',
    kind: 'decimal',
    section: 'outlook',
    label: '75th Percentile',
  },
  { field: 'currency', kind: 'decimal', section: 'outlook', label: 'Currency' },
  {
    field: 'payPeriod',
    kind: 'decimal',
    section: 'outlook',
    label: 'Pay Period',
  },
  {
    field: 'grossOrNet',
    kind: 'decimal',
    section: 'outlook',
    label: 'Gross or Net',
  },
  {
    field: 'experienceLevel',
    kind: 'decimal',
    section: 'outlook',
    label: 'Experience Level',
  },
  {
    field: 'baseYear',
    kind: 'decimal',
    section: 'outlook',
    label: 'Base Year',
  },
  {
    field: 'baseValue',
    kind: 'decimal',
    section: 'outlook',
    label: 'Base Value',
  },
  {
    field: 'projectedYear',
    kind: 'decimal',
    section: 'outlook',
    label: 'Projected Year',
  },
  {
    field: 'projectedValue',
    kind: 'decimal',
    section: 'outlook',
    label: 'Projected Value',
  },
  {
    field: 'growthPercent',
    kind: 'decimal',
    section: 'outlook',
    label: 'Growth Percentage',
  },
  {
    field: 'demandLevel',
    kind: 'decimal',
    section: 'outlook',
    label: 'Demand Level',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────────────────────────────

/**
 * Resource fields. `certificationCost` is `kind: 'decimal'` because the live
 * side is Prisma `Decimal` and the snapshot side is `string | null`. All
 * others are scalar.
 *
 * Temp-id creates are handled in `planResources`, not via a config entry: a
 * `new-*` resource is a create operation, not a field comparison.
 */
export const RESOURCE_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  { field: 'title', kind: 'scalar', section: 'resources', label: 'Title' },
  {
    field: 'description',
    kind: 'scalar',
    section: 'resources',
    label: 'Description',
  },
  { field: 'url', kind: 'scalar', section: 'resources', label: 'URL' },
  { field: 'type', kind: 'scalar', section: 'resources', label: 'Type' },
  {
    field: 'provider',
    kind: 'scalar',
    section: 'resources',
    label: 'Provider',
  },
  {
    field: 'costStatus',
    kind: 'scalar',
    section: 'resources',
    label: 'Cost Status',
  },
  {
    field: 'curationRationale',
    kind: 'scalar',
    section: 'resources',
    label: 'Curation Rationale',
  },
  {
    field: 'certificationCost',
    kind: 'decimal',
    section: 'resources',
    label: 'Certification Cost',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Derived label maps (used by the diff renderer)
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

/**
 * All career-strategy field labels, derived from every config above.
 * Re-exports the same maps the diff renderer needs; add a config, get a
 * label, no separate map to maintain.
 */
export const CAREER_STRATEGY_FIELD_LABELS = labelsFrom(
  CAREER_FIELD_CONFIG,
  PATHWAY_FIELD_CONFIG,
  STEP_FIELD_CONFIG,
  OUTLOOK_FIELD_CONFIG,
  RESOURCE_FIELD_CONFIG,
);
