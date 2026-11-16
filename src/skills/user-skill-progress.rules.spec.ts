import {
  SkillProgressSource,
  UserSkillStatus,
} from '../generated/prisma/client';
import { buildInitialAssessmentProgress } from './user-skill-progress.rules';

describe('buildInitialAssessmentProgress', () => {
  const userSkillId = 'skill-user-1';

  it('creates a row on first save (previous = null)', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: null,
      next: { status: UserSkillStatus.HAVE, rating: 4 },
    });

    expect(row).toEqual({
      userSkillId,
      rating: 4,
      source: SkillProgressSource.INITIAL_ASSESSMENT,
    });
  });

  it('creates a row when the first save is NOT_SURE', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: null,
      next: { status: UserSkillStatus.NOT_SURE, rating: null },
    });

    expect(row).toEqual({
      userSkillId,
      rating: null,
      source: SkillProgressSource.INITIAL_ASSESSMENT,
    });
  });

  it('returns null when status and rating are unchanged', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: { status: UserSkillStatus.HAVE, rating: 4 },
      next: { status: UserSkillStatus.HAVE, rating: 4 },
    });

    expect(row).toBeNull();
  });

  it('returns null when nothing changed on a DONT_HAVE row', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: { status: UserSkillStatus.DONT_HAVE, rating: null },
      next: { status: UserSkillStatus.DONT_HAVE, rating: null },
    });

    expect(row).toBeNull();
  });

  it('creates a row when a rating is removed from HAVE', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: { status: UserSkillStatus.HAVE, rating: 4 },
      next: { status: UserSkillStatus.HAVE, rating: null },
    });

    expect(row).toEqual({
      userSkillId,
      rating: null,
      source: SkillProgressSource.INITIAL_ASSESSMENT,
    });
  });

  it('creates a row on transition from NOT_SURE to HAVE', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: { status: UserSkillStatus.NOT_SURE, rating: null },
      next: { status: UserSkillStatus.HAVE, rating: 3 },
    });

    expect(row).toEqual({
      userSkillId,
      rating: 3,
      source: SkillProgressSource.INITIAL_ASSESSMENT,
    });
  });

  it('creates a row and clears rating on downgrade from HAVE to NOT_SURE', () => {
    const row = buildInitialAssessmentProgress({
      userSkillId,
      previous: { status: UserSkillStatus.HAVE, rating: 4 },
      next: { status: UserSkillStatus.NOT_SURE, rating: null },
    });

    expect(row).toEqual({
      userSkillId,
      rating: null,
      source: SkillProgressSource.INITIAL_ASSESSMENT,
    });
  });
});
