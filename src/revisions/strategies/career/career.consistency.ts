// ─────────────────────────────────────────────────────────────────────
// Phase A amendment (T0.5): the career aggregate now contains only
// career fields and the CareerSkill link-set. The only structural check
// left is duplicate skill IDs. Steps/resources/outlook/pathway checks
// have moved out with their aggregates.
//
// `duplicates` now lives in `envelope/duplicates.ts` because every
// strategy needs it.
// ─────────────────────────────────────────────────────────────────────

import type { CareerSnapshot } from './career.types';
import { duplicates } from '../../envelope/duplicates';

// Structural checks within one snapshot; comparison with the live career
// belongs in buildCareerPlan.
export const findSnapshotProblems = (snapshot: CareerSnapshot): string[] => {
  return duplicates(
    snapshot.skills,
    (s) => s.skillId,
    (i) => `skills.${i}`,
    'skillId',
  );
};
