import type {
  Resource,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../../generated/prisma/client';

export const RESOURCE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type ResourceSnapshot = {
  schemaVersion: typeof RESOURCE_SNAPSHOT_SCHEMA_VERSION;
  title: string;
  description: string | null;
  url: string;
  type: ResourceType;
  provider: string;
  costStatus: ResourceCostStatus;
  certificationCost: string | null;
  curationRationale: string;
  lastCheckedDate: string;
  status: ResourceStatus;
  estimatedWeeks: number | null;
  badgeImageUrl: string | null;
  outcomes: string[];
};

export type LiveResourceForPlan = Pick<
  Resource,
  | 'id'
  | 'title'
  | 'description'
  | 'url'
  | 'type'
  | 'provider'
  | 'costStatus'
  | 'certificationCost'
  | 'curationRationale'
  | 'lastCheckedDate'
  | 'status'
  | 'estimatedWeeks'
  | 'badgeImageUrl'
  | 'outcomes'
>;
