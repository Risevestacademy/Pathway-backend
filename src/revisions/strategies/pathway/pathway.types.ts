import type { Pathway } from '../../../generated/prisma/client';

export const PATHWAY_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * The editable part of a Pathway row. `careerId` is deliberately absent: it is
 * set when the session opens (from contextId) and is never editable. Stages
 * and steps are not part of this snapshot either; they are other aggregates.
 */
export type PathwaySnapshot = {
  schemaVersion: typeof PATHWAY_SNAPSHOT_SCHEMA_VERSION;
  title: string;
  description: string | null;
};

/**
 * `careerId` is loaded only so `plan` can run a defensive check against the
 * session's career. It is not in the snapshot and `apply` never writes it.
 */
export type LivePathwayForPlan = Pick<
  Pathway,
  'id' | 'careerId' | 'title' | 'description'
>;
