import { findFieldProblems } from '../../envelope/field-compare';
import { PATHWAY_FIELD_CONFIG } from './pathway.config';
import type { PathwaySnapshot } from './pathway.types';

export const findSnapshotProblems = (snapshot: PathwaySnapshot): string[] =>
  findFieldProblems(PATHWAY_FIELD_CONFIG, snapshot);
