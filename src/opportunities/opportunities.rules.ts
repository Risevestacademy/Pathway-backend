import type { OpportunityVerification } from '../generated/prisma/client';

export const CLOSING_SOON_DAYS = 7;
export const CLOSING_SOON_THRESHOLD_MS =
  CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000;

/**
 * The minimal shape the rules need. This allows passing Prisma records,
 * but also makes unit testing easy without a database.
 */
export interface OpportunityRuleInput {
  verification: OpportunityVerification;
  deadline: Date | null;
  deadlineUnknown: boolean;
}

export type OpportunityStatus = 'OPEN' | 'CLOSING_SOON' | 'CLOSED' | 'ROLLING';

/**
 * Determines if an opportunity should be shown in the public directory.
 * Drafts and withdrawn listings are always hidden.
 * Closed listings are hidden (except on the detail page, which checks status directly).
 */
export function isVisible(
  opportunity: OpportunityRuleInput,
  now: Date,
): boolean {
  if (opportunity.verification !== 'VERIFIED') return false;

  if (opportunity.deadlineUnknown) return true;

  if (!opportunity.deadline) return false;

  return opportunity.deadline.getTime() > now.getTime();
}

/**
 * Calculates the user-facing status label based on the deadline.
 */
export function deriveStatus(
  opportunity: OpportunityRuleInput,
  now: Date,
): OpportunityStatus {
  // If deadline is unknown, it's rolling (assuming it's verified)
  if (opportunity.deadlineUnknown || !opportunity.deadline) {
    return 'ROLLING';
  }

  const timeUntilDeadline = opportunity.deadline.getTime() - now.getTime();

  // If the deadline has passed, it's closed
  if (timeUntilDeadline <= 0) {
    return 'CLOSED';
  }

  // If it's within the 7-day threshold, it's closing soon
  if (timeUntilDeadline <= CLOSING_SOON_THRESHOLD_MS) {
    return 'CLOSING_SOON';
  }

  // Otherwise, it's open
  return 'OPEN';
}
