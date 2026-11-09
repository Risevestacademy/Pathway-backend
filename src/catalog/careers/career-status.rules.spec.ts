import { CareerStatus } from '../../generated/prisma/client';
import { canRetire, canSave } from './career-status.rules';

describe('canRetire', () => {
  it.each([
    [CareerStatus.PUBLISHED, true],
    [CareerStatus.DRAFT, false],
    [CareerStatus.RETIRED, false],
  ])('%s can be retired: %s', (status, allowed) => {
    expect(canRetire(status)).toBe(allowed);
  });
});

describe('canSave', () => {
  it.each([
    [CareerStatus.PUBLISHED, true],
    [CareerStatus.DRAFT, false],
    [CareerStatus.RETIRED, false],
  ])('%s can be newly saved: %s', (status, allowed) => {
    expect(canSave(status)).toBe(allowed);
  });
});
