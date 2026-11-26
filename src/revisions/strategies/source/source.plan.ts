import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { SOURCE_FIELD_CONFIG } from './source.config';
import type { LiveSourceForPlan, SourceSnapshot } from './source.types';

export function planSourceFields(
  live: LiveSourceForPlan,
  snapshot: SourceSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(SOURCE_FIELD_CONFIG, snapshot)) {
    blockers.push({
      code: 'MISSING_SOURCE_FIELD',
      message: `Source field "${entry.field}" is required`,
      section: 'sources',
      entityId: live.id,
    });
  }

  compareFields(SOURCE_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function buildSourcePlan(args: {
  live: LiveSourceForPlan;
  snapshot: SourceSnapshot;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];
  planSourceFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
