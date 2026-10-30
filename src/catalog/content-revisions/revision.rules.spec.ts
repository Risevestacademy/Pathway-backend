import { Role } from '../../generated/prisma/client';
import { isRevisionStale, isSelfReviewBlocked } from './revision.rules';

describe('isRevisionStale', () => {
  it.each([
    [3, 3, false],
    [3, 4, true],
    [2, 5, true],
    [4, 3, true],
  ])('base %i against live %i is stale: %s', (base, live, stale) => {
    expect(isRevisionStale(base, live)).toBe(stale);
  });
});

describe('isSelfReviewBlocked', () => {
  const roles = Object.values(Role);

  it.each(roles)(
    'a %s who created the revision is blocked unless ADMIN',
    (role) => {
      expect(isSelfReviewBlocked('user-1', { id: 'user-1', role })).toBe(
        role !== Role.ADMIN,
      );
    },
  );

  it.each(roles)(
    'a %s reviewing someone else’s revision is never blocked',
    (role) => {
      expect(isSelfReviewBlocked('user-1', { id: 'user-2', role })).toBe(false);
    },
  );
});
