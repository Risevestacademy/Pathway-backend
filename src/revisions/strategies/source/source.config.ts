import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

export const SOURCE_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'name',
    kind: 'scalar',
    section: 'sources',
    label: 'Name',
    required: true,
    valueType: 'string',
  },
  {
    field: 'url',
    kind: 'scalar',
    section: 'sources',
    label: 'URL',
    valueType: 'string',
  },
  {
    field: 'lastCheckedAt',
    kind: 'date',
    section: 'sources',
    label: 'Last Checked',
  },
] as const;

export const SOURCE_STRATEGY_FIELD_LABELS = labelsFrom(SOURCE_FIELD_CONFIG);
