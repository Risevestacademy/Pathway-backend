import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

export const PATHWAY_STAGE_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'title',
    kind: 'scalar',
    section: 'stages',
    label: 'Title',
    required: true,
    valueType: 'string',
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'stages',
    label: 'Description',
    valueType: 'string',
  },
] as const;

export const PATHWAY_STAGE_STRATEGY_FIELD_LABELS = labelsFrom(
  PATHWAY_STAGE_FIELD_CONFIG,
);
