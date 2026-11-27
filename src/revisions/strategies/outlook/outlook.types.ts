import type {
  Demand,
  OutlookData,
  OutlookType,
} from '../../../generated/prisma/client';

export const OUTLOOK_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type OutlookSnapshot = {
  schemaVersion: typeof OUTLOOK_SNAPSHOT_SCHEMA_VERSION;
  type: OutlookType;
  geography: string;
  sourceId: string | null;
  period: string;
  median: string | null;
  percentile25: string | null;
  percentile75: string | null;
  currency: string | null;
  payPeriod: string | null;
  grossOrNet: string | null;
  experienceLevel: string | null;
  baseYear: number | null;
  baseValue: number | null;
  projectedYear: number | null;
  projectedValue: number | null;
  growthPercent: string | null;
  demandLevel: Demand | null;
};

export type LiveOutlookForPlan = Omit<OutlookData, 'createdAt' | 'updatedAt'>;
