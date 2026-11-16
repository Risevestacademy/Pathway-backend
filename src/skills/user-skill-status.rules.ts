import { UserSkillStatus } from '../generated/prisma/client';

export interface UserSkillStatusInput {
  status: UserSkillStatus;
  rating: number | null;
}

export interface UserSkillStatusResult {
  status: UserSkillStatus;
  rating: number | null;
}

/**
 * Enforces the invariant: a rating is allowed only when status is HAVE.
 * A rating is cleared when status changes to anything else.
 * "Not sure" never carries a rating, so it can never be read as 0.
 * Range validation (1–5) is the caller's (DTO's) responsibility.
 */
export function normalizeUserSkillStatus(
  input: UserSkillStatusInput,
): UserSkillStatusResult {
  if (input.status !== UserSkillStatus.HAVE) {
    return { status: input.status, rating: null };
  }

  return { status: input.status, rating: input.rating ?? null };
}
