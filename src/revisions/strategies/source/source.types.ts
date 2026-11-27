import type { Source } from '../../../generated/prisma/client';

export const SOURCE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SourceSnapshot = {
  schemaVersion: typeof SOURCE_SNAPSHOT_SCHEMA_VERSION;
  name: string;
  url: string | null;
  lastCheckedAt: string | null;
};

export type LiveSourceForPlan = Pick<
  Source,
  'id' | 'name' | 'url' | 'lastCheckedAt'
>;
