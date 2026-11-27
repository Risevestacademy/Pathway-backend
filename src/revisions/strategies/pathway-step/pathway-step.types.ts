import type { PathwayStep } from '../../../generated/prisma/client';

export const PATHWAY_STEP_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * The editable part of a step plus its two link-sets.
 *
 * - `stageId` is a nullable FK to PathwayStage, compared as a scalar. It is not
 *   a link-set and is not a temp-id field: a stage must already exist.
 * - `order` is carried for the defensive check only. It is not in the field
 *   config and is never written (see pathway-step.plan.ts).
 * - `skillIds` and `resourceIds` are required lists of real ids. Validation
 *   rejects a snapshot that omits them, because the link-set comparison treats
 *   a missing list as empty and would unlink everything.
 */
export type PathwayStepSnapshot = {
  schemaVersion: typeof PATHWAY_STEP_SNAPSHOT_SCHEMA_VERSION;
  title: string;
  description: string | null;
  learningObjective: string;
  prerequisites: string | null;
  expectedActivity: string;
  stageId: string | null;
  order: number;
  skillIds: string[];
  resourceIds: string[];
};

/**
 * `pathwayId` is not loaded: the step's parent pathway is not editable and
 * nothing in plan reads it. The link-sets are mapped to the `{ skillId }` and
 * `{ resourceId }` shape `compareLinkSet` reads.
 */
export type LivePathwayStepForPlan = Pick<
  PathwayStep,
  | 'id'
  | 'stageId'
  | 'title'
  | 'description'
  | 'learningObjective'
  | 'prerequisites'
  | 'expectedActivity'
  | 'order'
> & {
  skills: { skillId: string }[];
  resources: { resourceId: string }[];
};
