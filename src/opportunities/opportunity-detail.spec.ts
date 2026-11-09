import { describe, expect, it } from '@jest/globals';
import {
  OpportunityType,
  OpportunityVerification,
} from '../generated/prisma/client';
import {
  buildOpportunityDetailWhere,
  OPPORTUNITY_DETAIL_SELECT,
  toOpportunityDetail,
  type OpportunityDetailRow,
} from './opportunity-detail';

describe('opportunity detail', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  const dayMs = 24 * 60 * 60 * 1000;

  const row = (
    overrides: Partial<OpportunityDetailRow> = {},
  ): OpportunityDetailRow => ({
    id: 'opp-1',
    title: 'Backend Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Acme',
    location: 'Lagos',
    description: 'Build APIs.',
    responsibilities: ['Write endpoints', 'Review code'],
    audience: ['Students'],
    pay: '₦150,000 a month',
    duration: '3 months',
    startDate: new Date('2026-12-01T00:00:00.000Z'),
    applyUrl: 'https://example.com/apply',
    deadline: new Date(now.getTime() + 30 * dayMs),
    deadlineUnknown: false,
    verification: OpportunityVerification.VERIFIED,
    careers: [{ career: { id: 'career-1', title: 'Software Engineer' } }],
    skills: [{ skill: { id: 'skill-1', name: 'TypeScript' } }],
    ...overrides,
  });

  describe('toOpportunityDetail', () => {
    it('maps every field the detail screen needs', () => {
      expect(toOpportunityDetail(row(), now)).toEqual({
        id: 'opp-1',
        title: 'Backend Intern',
        type: OpportunityType.INTERNSHIP,
        organisation: 'Acme',
        location: 'Lagos',
        description: 'Build APIs.',
        status: 'OPEN',
        responsibilities: ['Write endpoints', 'Review code'],
        audience: ['Students'],
        pay: '₦150,000 a month',
        duration: '3 months',
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        applyUrl: 'https://example.com/apply',
        deadline: new Date(now.getTime() + 30 * dayMs),
        careers: [{ id: 'career-1', title: 'Software Engineer' }],
        skills: [{ id: 'skill-1', name: 'TypeScript' }],
      });
    });

    it('shows a listing whose deadline has passed as CLOSED', () => {
      const result = toOpportunityDetail(
        row({ deadline: new Date(now.getTime() - 60_000) }),
        now,
      );

      expect(result.status).toBe('CLOSED');
      expect(result.title).toBe('Backend Intern');
    });

    it('shows a deadline within 7 days as CLOSING_SOON', () => {
      const result = toOpportunityDetail(
        row({ deadline: new Date(now.getTime() + 3 * dayMs) }),
        now,
      );

      expect(result.status).toBe('CLOSING_SOON');
    });

    it('shows an unknown deadline as ROLLING with a null deadline', () => {
      const result = toOpportunityDetail(
        row({ deadline: null, deadlineUnknown: true }),
        now,
      );

      expect(result.status).toBe('ROLLING');
      expect(result.deadline).toBeNull();
    });

    it('keeps optional fields null and relations empty', () => {
      const result = toOpportunityDetail(
        row({
          pay: null,
          duration: null,
          startDate: null,
          careers: [],
          skills: [],
        }),
        now,
      );

      expect(result).toMatchObject({
        pay: null,
        duration: null,
        startDate: null,
        careers: [],
        skills: [],
      });
    });

    it('does not leak review or internal fields', () => {
      const result = toOpportunityDetail(
        {
          ...row(),
          verifiedById: 'admin-1',
        } as OpportunityDetailRow,
        now,
      );

      expect(result).not.toHaveProperty('verifiedById');
      expect(result).not.toHaveProperty('verification');
      expect(result).not.toHaveProperty('deadlineUnknown');
    });
  });

  describe('buildOpportunityDetailWhere', () => {
    it('matches the id among VERIFIED listings only, with no deadline filter', () => {
      expect(buildOpportunityDetailWhere('opp-1')).toEqual({
        id: 'opp-1',
        verification: OpportunityVerification.VERIFIED,
      });
    });
  });

  describe('OPPORTUNITY_DETAIL_SELECT', () => {
    it('never selects verifiedById', () => {
      expect(OPPORTUNITY_DETAIL_SELECT).not.toHaveProperty('verifiedById');
    });
  });
});
