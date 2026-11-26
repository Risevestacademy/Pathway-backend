import { findFieldProblems } from '../../envelope/field-compare';
import { SKILL_FIELD_CONFIG } from './skill.config';
import type { SkillSnapshot } from './skill.types';

export const findSnapshotProblems = (snapshot: SkillSnapshot): string[] =>
  findFieldProblems(SKILL_FIELD_CONFIG, snapshot);
