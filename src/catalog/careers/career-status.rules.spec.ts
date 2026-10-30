import { CareerStatus } from '../../generated/prisma/client';
import { canRetire } from './career-status.rules';

describe('canRetire', () => {
  it.each([
    [CareerStatus.PUBLISHED, true],
    [CareerStatus.DRAFT, false],
    [CareerStatus.RETIRED, false],
  ])('%s can be retired: %s', (status, allowed) => {
    expect(canRetire(status)).toBe(allowed);
  });
});
