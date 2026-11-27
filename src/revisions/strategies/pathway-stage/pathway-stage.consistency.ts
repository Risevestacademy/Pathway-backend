import { findFieldProblems } from '../../envelope/field-compare';
import { PATHWAY_STAGE_FIELD_CONFIG } from './pathway-stage.config';
import type { PathwayStageSnapshot } from './pathway-stage.types';

export const findSnapshotProblems = (
  snapshot: PathwayStageSnapshot,
): string[] => findFieldProblems(PATHWAY_STAGE_FIELD_CONFIG, snapshot);
