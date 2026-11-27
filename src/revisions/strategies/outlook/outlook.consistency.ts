import { findFieldProblems } from '../../envelope/field-compare';
import { OUTLOOK_FIELD_CONFIG } from './outlook.config';
import type { OutlookSnapshot } from './outlook.types';

export const findSnapshotProblems = (snapshot: OutlookSnapshot): string[] =>
  findFieldProblems(OUTLOOK_FIELD_CONFIG, snapshot);
