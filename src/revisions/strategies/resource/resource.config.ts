import {
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import {
  labelsFrom,
  type FieldConfigEntry,
} from '../../envelope/field-compare';

export const RESOURCE_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  {
    field: 'title',
    kind: 'scalar',
    section: 'resources',
    label: 'Title',
    required: true,
    valueType: 'string',
  },
  {
    field: 'description',
    kind: 'scalar',
    section: 'resources',
    label: 'Description',
    valueType: 'string',
  },
  {
    field: 'url',
    kind: 'scalar',
    section: 'resources',
    label: 'URL',
    required: true,
    valueType: 'string',
  },
  {
    field: 'type',
    kind: 'scalar',
    section: 'resources',
    label: 'Type',
    required: true,
    valueType: Object.values(ResourceType),
  },
  {
    field: 'provider',
    kind: 'scalar',
    section: 'resources',
    label: 'Provider',
    required: true,
    valueType: 'string',
  },
  {
    field: 'costStatus',
    kind: 'scalar',
    section: 'resources',
    label: 'Cost',
    valueType: Object.values(ResourceCostStatus),
  },
  {
    field: 'certificationCost',
    kind: 'decimal',
    section: 'resources',
    label: 'Certification Cost',
    scale: 30,
    precision: 65,
  },
  {
    field: 'curationRationale',
    kind: 'scalar',
    section: 'resources',
    label: 'Curation Rationale',
    required: true,
    valueType: 'string',
  },
  {
    field: 'lastCheckedDate',
    kind: 'date',
    section: 'resources',
    label: 'Last Checked',
    required: true,
  },
  {
    field: 'status',
    kind: 'scalar',
    section: 'resources',
    label: 'Status',
    valueType: Object.values(ResourceStatus),
  },
  {
    field: 'estimatedWeeks',
    kind: 'scalar',
    section: 'resources',
    label: 'Estimated Weeks',
    valueType: 'int',
  },
  {
    field: 'badgeImageUrl',
    kind: 'scalar',
    section: 'resources',
    label: 'Badge Image',
    valueType: 'string',
  },
  {
    field: 'outcomes',
    kind: 'array',
    section: 'resources',
    label: 'Outcomes',
  },
] as const;

export const RESOURCE_STRATEGY_FIELD_LABELS = labelsFrom(RESOURCE_FIELD_CONFIG);
