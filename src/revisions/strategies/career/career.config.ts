// ─────────────────────────────────────────────────────────────────────
// Career strategy field config.
//
// The generic config types and the interpreter live in
// `envelope/field-compare.ts`. This file contains ONLY the career strategy's
// own config. Pathway, step, resource, and outlook configs have moved out
// (or will be defined by their own strategies in later tickets) — they are
// not part of the career aggregate. See README §"Aggregate boundaries".
//
// Adding a field to `Career`:
//   1. Add the column in `schema.prisma` and migrate.
//   2. Add the field to `CareerSnapshotCareer` and `LiveCareerForPlan`.
//   3. Add one entry below.
//   4. No changes to `plan`, `apply`, or `diff`. That is the config contract.
// ─────────────────────────────────────────────────────────────────────

import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

// Re-export the generic config types so callers that previously imported
// them from here keep working (career.plan.ts, career.strategy.ts, etc.).
// The canonical home is `envelope/field-compare.ts`.
export type { FieldKind, FieldConfigEntry } from '../../envelope/field-compare';
export { labelsFrom } from '../../envelope/field-compare';

// ─────────────────────────────────────────────────────────────────────
// Career-level fields
// ─────────────────────────────────────────────────────────────────────

/**
 * Scalar and array fields on `Career` itself. The `section` is always
 * `'career'`.
 *
 * `required: true` means an empty (null/undefined/'') value blocks
 * submission; the plan emits a `MISSING_CAREER_FIELD` blocker.
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
// Derived label map (used by the diff renderer)
// ─────────────────────────────────────────────────────────────────────

/**
 * All career-strategy field labels, derived from every config above.
 * The diff renderer reads this to label each `FieldChange`; the strategy
 * exposes it as its `fieldLabels` property.
 */
export const CAREER_STRATEGY_FIELD_LABELS = labelsFrom(CAREER_FIELD_CONFIG);
