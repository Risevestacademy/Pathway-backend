import { isTempId } from '../../envelope/strategy.types';
import { findFieldProblems } from '../../envelope/field-compare';
import { PATHWAY_STEP_FIELD_CONFIG } from './pathway-step.config';
import type { PathwayStepSnapshot } from './pathway-step.types';

function linkSetProblems(
  field: 'skillIds' | 'resourceIds',
  value: unknown,
): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    return [`${field}: must be a list of strings`];
  }
  const problems: string[] = [];
  if (new Set(value).size !== value.length) {
    problems.push(`${field}: must not contain duplicates`);
  }
  // A temp id here would make compareLinkSet throw in plan. Steps link to
  // skills and resources that already exist; in-session creation is deferred.
  if (value.some((id) => isTempId(id))) {
    problems.push(`${field}: must be existing ids, not new-* temp ids`);
  }
  return problems;
}

export const findSnapshotProblems = (
  snapshot: PathwayStepSnapshot,
): string[] => [
  ...findFieldProblems(PATHWAY_STEP_FIELD_CONFIG, snapshot),
  ...linkSetProblems('skillIds', snapshot.skillIds),
  ...linkSetProblems('resourceIds', snapshot.resourceIds),
];
