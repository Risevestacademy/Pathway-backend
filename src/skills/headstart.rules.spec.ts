import { UserSkillStatus } from '../generated/prisma/client';
import {
  computeHeadstart,
  HeadstartSkill,
  HeadstartStep,
} from './headstart.rules';

describe('computeHeadstart', () => {
  const step = (
    id: string,
    order: number,
    skillIds: string[],
  ): HeadstartStep => ({ id, order, skillIds });

  const skill = (skillId: string, status: UserSkillStatus): HeadstartSkill => ({
    skillId,
    status,
  });

  it('returns the first step that teaches a DONT_HAVE skill', () => {
    const result = computeHeadstart(
      [step('s1', 1, ['a']), step('s2', 2, ['b']), step('s3', 3, ['c'])],
      [skill('b', UserSkillStatus.DONT_HAVE)],
    );

    expect(result).toEqual({ startStepId: 's2', allGapsClosed: false });
  });

  it('ignores NOT_SURE when picking the start step', () => {
    const result = computeHeadstart(
      [step('s1', 1, ['a']), step('s2', 2, ['b']), step('s3', 3, ['c'])],
      [
        skill('a', UserSkillStatus.NOT_SURE),
        skill('b', UserSkillStatus.NOT_SURE),
        skill('c', UserSkillStatus.DONT_HAVE),
      ],
    );

    expect(result).toEqual({ startStepId: 's3', allGapsClosed: false });
  });

  it('returns null + allGapsClosed when every skill is HAVE', () => {
    const result = computeHeadstart(
      [step('s1', 1, ['a']), step('s2', 2, ['b'])],
      [skill('a', UserSkillStatus.HAVE), skill('b', UserSkillStatus.HAVE)],
    );

    expect(result).toEqual({ startStepId: null, allGapsClosed: true });
  });

  it('returns null + allGapsClosed when every skill is NOT_SURE', () => {
    const result = computeHeadstart(
      [step('s1', 1, ['a'])],
      [skill('a', UserSkillStatus.NOT_SURE)],
    );

    expect(result).toEqual({ startStepId: null, allGapsClosed: true });
  });

  it('skips steps with no skills', () => {
    const result = computeHeadstart(
      [step('s1', 1, []), step('s2', 2, ['a'])],
      [skill('a', UserSkillStatus.DONT_HAVE)],
    );

    expect(result).toEqual({ startStepId: 's2', allGapsClosed: false });
  });

  it('returns the earliest step when multiple steps have gaps', () => {
    const result = computeHeadstart(
      [step('s1', 1, ['a']), step('s2', 2, ['b']), step('s3', 3, ['c'])],
      [
        skill('a', UserSkillStatus.DONT_HAVE),
        skill('b', UserSkillStatus.DONT_HAVE),
        skill('c', UserSkillStatus.DONT_HAVE),
      ],
    );

    expect(result).toEqual({ startStepId: 's1', allGapsClosed: false });
  });

  it('returns null + allGapsClosed when there are no steps', () => {
    const result = computeHeadstart(
      [],
      [skill('a', UserSkillStatus.DONT_HAVE)],
    );

    expect(result).toEqual({ startStepId: null, allGapsClosed: true });
  });

  it('does not mutate the input steps array', () => {
    const steps: HeadstartStep[] = [step('s2', 2, ['b']), step('s1', 1, ['a'])];
    const originalOrder = steps.map((s) => s.id);

    computeHeadstart(steps, [skill('a', UserSkillStatus.DONT_HAVE)]);

    expect(steps.map((s) => s.id)).toEqual(originalOrder);
  });
});
