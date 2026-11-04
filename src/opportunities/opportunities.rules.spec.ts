import { isVisible, deriveStatus } from './opportunities.rules';

describe('Opportunity Rules', () => {
  // Fixed 'now' for deterministic tests
  const now = new Date('2026-11-04T12:00:00.000Z');
  const dayMs = 24 * 60 * 60 * 1000;

  const baseOpportunity = {
    verification: 'VERIFIED' as const,
    deadlineUnknown: false,
    deadline: null as Date | null,
  };

  describe('isVisible', () => {
    it('is false for DRAFT', () => {
      expect(
        isVisible({ ...baseOpportunity, verification: 'DRAFT' }, now),
      ).toBe(false);
    });

    it('is false for WITHDRAWN', () => {
      expect(
        isVisible({ ...baseOpportunity, verification: 'WITHDRAWN' }, now),
      ).toBe(false);
    });

    it('is true if deadline is in the future', () => {
      const opp = {
        ...baseOpportunity,
        deadline: new Date(now.getTime() + dayMs),
      };
      expect(isVisible(opp, now)).toBe(true);
    });

    it('is false if deadline passed 1 minute ago', () => {
      const opp = {
        ...baseOpportunity,
        deadline: new Date(now.getTime() - 60000),
      };
      expect(isVisible(opp, now)).toBe(false);
    });

    it('is false if no deadline and deadlineUnknown is false', () => {
      const opp = {
        ...baseOpportunity,
        deadline: null,
        deadlineUnknown: false,
      };
      expect(isVisible(opp, now)).toBe(false);
    });

    it('is true if deadlineUnknown is true, even with no deadline', () => {
      const opp = { ...baseOpportunity, deadlineUnknown: true, deadline: null };
      expect(isVisible(opp, now)).toBe(true);
    });
  });

  describe('deriveStatus', () => {
    it('returns CLOSED if deadline passed a minute ago', () => {
      const opp = {
        ...baseOpportunity,
        deadline: new Date(now.getTime() - 60000),
      };
      expect(deriveStatus(opp, now)).toBe('CLOSED');
    });

    it('returns CLOSING_SOON at exactly 7 days', () => {
      const opp = {
        ...baseOpportunity,
        deadline: new Date(now.getTime() + 7 * dayMs),
      };
      expect(deriveStatus(opp, now)).toBe('CLOSING_SOON');
    });

    it('returns OPEN at 8 days', () => {
      const opp = {
        ...baseOpportunity,
        deadline: new Date(now.getTime() + 8 * dayMs),
      };
      expect(deriveStatus(opp, now)).toBe('OPEN');
    });

    it('returns ROLLING if deadlineUnknown is true', () => {
      const opp = { ...baseOpportunity, deadlineUnknown: true, deadline: null };
      expect(deriveStatus(opp, now)).toBe('ROLLING');
    });

    it('returns ROLLING if deadline is null but deadlineUnknown is false (fallback)', () => {
      const opp = {
        ...baseOpportunity,
        deadline: null,
        deadlineUnknown: false,
      };
      expect(deriveStatus(opp, now)).toBe('ROLLING');
    });
  });
});
