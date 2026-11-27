import { findFieldProblems } from '../../envelope/field-compare';
import { SOURCE_FIELD_CONFIG } from './source.config';
import type { SourceSnapshot } from './source.types';

export const findSnapshotProblems = (snapshot: SourceSnapshot): string[] =>
  findFieldProblems(SOURCE_FIELD_CONFIG, snapshot);
