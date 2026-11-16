import { SkillProgressSource } from '../generated/prisma/client';
import { UserSkillStatusInput } from './user-skill-status.rules';

export interface UserSkillProgressRow {
  userSkillId: string;
  rating: number | null;
  source: SkillProgressSource;
}

export interface BuildInitialAssessmentProgressInput {
  userSkillId: string;
  previous: UserSkillStatusInput | null;
  next: UserSkillStatusInput;
}

/**
 * Maps a (previous, next) skill transition to a UserSkillProgress row
 * with source INITIAL_ASSESSMENT.
 *
 * Returns null when nothing changed (status AND rating are equal) so
 * repeated saves of an untouched skill do not spam the audit ledger.
 *
 * INITIAL_ASSESSMENT rows never carry an assessmentId — that field is
 * reserved for STEP_ASSESSMENT.
 */
export function buildInitialAssessmentProgress(
  input: BuildInitialAssessmentProgressInput,
): UserSkillProgressRow | null {
  const { userSkillId, previous, next } = input;

  if (
    previous !== null &&
    previous.status === next.status &&
    previous.rating === next.rating
  ) {
    return null;
  }

  return {
    userSkillId,
    rating: next.rating,
    source: SkillProgressSource.INITIAL_ASSESSMENT,
  };
}
