import { UserSkillStatus } from '../generated/prisma/client';
import {
  normalizeUserSkillStatus,
  UserSkillStatusInput,
} from './user-skill-status.rules';

describe('normalizeUserSkillStatus', () => {
  const cases: Array<{
    name: string;
    input: UserSkillStatusInput;
    expected: UserSkillStatusInput;
  }> = [
    {
      name: 'HAVE with rating preserves the rating',
      input: { status: UserSkillStatus.HAVE, rating: 4 },
      expected: { status: UserSkillStatus.HAVE, rating: 4 },
    },
    {
      name: 'HAVE without rating stays null',
      input: { status: UserSkillStatus.HAVE, rating: null },
      expected: { status: UserSkillStatus.HAVE, rating: null },
    },
    {
      name: 'DONT_HAVE clears a rating',
      input: { status: UserSkillStatus.DONT_HAVE, rating: 3 },
      expected: { status: UserSkillStatus.DONT_HAVE, rating: null },
    },
    {
      name: 'DONT_HAVE with null rating is idempotent',
      input: { status: UserSkillStatus.DONT_HAVE, rating: null },
      expected: { status: UserSkillStatus.DONT_HAVE, rating: null },
    },
    {
      name: 'NOT_SURE with rating 0 yields null (0 is not a rating)',
      input: { status: UserSkillStatus.NOT_SURE, rating: 0 },
      expected: { status: UserSkillStatus.NOT_SURE, rating: null },
    },
    {
      name: 'NOT_SURE with null rating stays null',
      input: { status: UserSkillStatus.NOT_SURE, rating: null },
      expected: { status: UserSkillStatus.NOT_SURE, rating: null },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(normalizeUserSkillStatus(input)).toEqual(expected);
  });
});
