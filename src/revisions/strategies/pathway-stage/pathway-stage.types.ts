import type { PathwayStage } from '../../../generated/prisma/client';

export const PATHWAY_STAGE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * The editable part of a stage, plus `order` for the defensive check only.
 * `pathwayId` is the parent FK, set when the session opens, and is not in the
 * snapshot. `order` is carried so `plan` can block an attempted reorder; it is
 * not in the field config and is never written.
 */
export type PathwayStageSnapshot = {
  schemaVersion: typeof PATHWAY_STAGE_SNAPSHOT_SCHEMA_VERSION;
  title: string;
  description: string | null;
  order: number;
};

export type LivePathwayStageForPlan = Pick<
  PathwayStage,
  'id' | 'pathwayId' | 'title' | 'description' | 'order'
>;
