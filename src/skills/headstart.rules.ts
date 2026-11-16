import { UserSkillStatus } from '../generated/prisma/client';

export interface HeadstartStep {
  id: string;
  order: number;
  skillIds: string[];
}

export interface HeadstartSkill {
  skillId: string;
  status: UserSkillStatus;
}

export interface HeadstartResult {
  startStepId: string | null;
  allGapsClosed: boolean;
}

/**
 * Walks steps in ascending order and returns the first step that teaches
 * a skill the user marked DONT_HAVE. NOT_SURE and HAVE do not shift the
 * start. Returns { startStepId: null, allGapsClosed: true } when no step
 * intersects the gap set.
 *
 * Never writes. Never marks a step complete. The caller persists
 * startStepId on UserPathway if it differs from the stored value.
 */
export function computeHeadstart(
  steps: HeadstartStep[],
  skills: HeadstartSkill[],
): HeadstartResult {
  const gapSkillIds = new Set<string>();
  for (const skill of skills) {
    if (skill.status === UserSkillStatus.DONT_HAVE) {
      gapSkillIds.add(skill.skillId);
    }
  }

  if (gapSkillIds.size === 0) {
    return { startStepId: null, allGapsClosed: true };
  }

  const orderedSteps = [...steps].sort((a, b) => a.order - b.order);

  for (const step of orderedSteps) {
    if (step.skillIds.some((id) => gapSkillIds.has(id))) {
      return { startStepId: step.id, allGapsClosed: false };
    }
  }

  return { startStepId: null, allGapsClosed: true };
}
