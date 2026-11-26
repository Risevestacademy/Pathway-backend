import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { OUTLOOK_FIELD_CONFIG } from './outlook.config';
import type { LiveOutlookForPlan, OutlookSnapshot } from './outlook.types';

export function planOutlookFields(
  live: LiveOutlookForPlan,
  snapshot: OutlookSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(OUTLOOK_FIELD_CONFIG, snapshot)) {
    blockers.push({
      code: 'MISSING_OUTLOOK_FIELD',
      message: `Outlook field "${entry.field}" is required`,
      section: 'outlook',
      entityId: live.id,
    });
  }

  compareFields(OUTLOOK_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function buildOutlookPlan(args: {
  live: LiveOutlookForPlan;
  snapshot: OutlookSnapshot;
  careerId?: string;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];
  if (args.careerId !== undefined && args.live.careerId !== args.careerId) {
    blockers.push({
      code: 'OUTLOOK_CAREER_MISMATCH',
      message: 'This outlook row belongs to a different career',
      section: 'outlook',
      entityId: args.live.id,
    });
  }
  planOutlookFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
