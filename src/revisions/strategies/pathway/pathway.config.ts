import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

/**
 * Title and description only. Stage and step fields do not belong here, and
 * neither does `careerId` (set at session open, not editable).
 */
export const PATHWAY_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'title',
    kind: 'scalar',
    section: 'pathway',
    label: 'Title',
    required: true,
    valueType: 'string',
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'pathway',
    label: 'Description',
    valueType: 'string',
  },
] as const;

export const PATHWAY_STRATEGY_FIELD_LABELS = labelsFrom(PATHWAY_FIELD_CONFIG);
