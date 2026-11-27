import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

/**
 * The step row's own editable columns. Not here, on purpose:
 * - `order`: not editable. Step ordering lives on the pathway
 *   revision, and PATHWAY does not own it yet either, so no strategy edits it.
 *   plan blocks a changed order instead (see pathway-step.plan.ts).
 * - `skillIds` / `resourceIds`: link-sets, compared by compareLinkSet.
 * - `pathwayId`: the parent FK, not editable.
 *
 * `stageId` is a nullable FK compared as a scalar, not a link.
 */
export const PATHWAY_STEP_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'title',
    kind: 'scalar',
    section: 'steps',
    label: 'Title',
    required: true,
    valueType: 'string',
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'steps',
    label: 'Description',
    valueType: 'string',
  },
  {
    field: 'learningObjective',
    kind: 'scalar',
    section: 'steps',
    label: 'Learning Objective',
    required: true,
    valueType: 'string',
  },
  {
    field: 'prerequisites',
    kind: 'scalar',
    section: 'steps',
    label: 'Prerequisites',
    valueType: 'string',
  },
  {
    field: 'expectedActivity',
    kind: 'scalar',
    section: 'steps',
    label: 'Expected Activity',
    required: true,
    valueType: 'string',
  },
  {
    field: 'stageId',
    kind: 'scalar',
    section: 'steps',
    label: 'Stage',
    valueType: 'string',
  },
] as const;

export const PATHWAY_STEP_STRATEGY_FIELD_LABELS = labelsFrom(
  PATHWAY_STEP_FIELD_CONFIG,
);
