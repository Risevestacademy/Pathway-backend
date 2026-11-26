import { findFieldProblems } from '../../envelope/field-compare';
import { RESOURCE_FIELD_CONFIG } from './resource.config';
import type { ResourceSnapshot } from './resource.types';

export const findSnapshotProblems = (snapshot: ResourceSnapshot): string[] =>
  findFieldProblems(RESOURCE_FIELD_CONFIG, snapshot);
