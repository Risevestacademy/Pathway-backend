import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

export const SKILL_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'name',
    kind: 'scalar',
    section: 'skills',
    label: 'Name',
    required: true,
    valueType: 'string',
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'skills',
    label: 'Description',
    valueType: 'string',
  },
] as const;

export const SKILL_STRATEGY_FIELD_LABELS = labelsFrom(SKILL_FIELD_CONFIG);
