import type {
  PlanBlocker,
  PlanContext,
  PlanOperation,
} from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { PATHWAY_FIELD_CONFIG } from './pathway.config';
import type { LivePathwayForPlan, PathwaySnapshot } from './pathway.types';

export function planPathwayFields(
  live: LivePathwayForPlan,
  snapshot: PathwaySnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(PATHWAY_FIELD_CONFIG, snapshot)) {
    blockers.push({
      code: 'MISSING_PATHWAY_FIELD',
      message: `Pathway field "${entry.field}" is required`,
      section: 'pathway',
      entityId: live.id,
    });
  }

  compareFields(PATHWAY_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function buildPathwayPlan(args: {
  live: LivePathwayForPlan;
  snapshot: PathwaySnapshot;
  context?: PlanContext;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  // Defensive: a pathway belongs to exactly one career (Pathway.careerId is
  // @unique). The session was opened for a career, so a live row that points
  // at a different one means the session and the row have drifted apart.
  // careerId is never compared or written; this only blocks.
  if (args.context && args.live.careerId !== args.context.careerId) {
    blockers.push({
      code: 'PATHWAY_CAREER_MISMATCH',
      message:
        'Pathway does not belong to the career this session was opened for',
      section: 'pathway',
      entityId: args.live.id,
    });
  }

  planPathwayFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
