import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { RESOURCE_FIELD_CONFIG } from './resource.config';
import type { LiveResourceForPlan, ResourceSnapshot } from './resource.types';

export function planResourceFields(
  live: LiveResourceForPlan,
  snapshot: ResourceSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(RESOURCE_FIELD_CONFIG, snapshot)) {
    blockers.push({
      code: 'MISSING_RESOURCE_FIELD',
      message: `Resource field "${entry.field}" is required`,
      section: 'resources',
      entityId: live.id,
    });
  }

  compareFields(RESOURCE_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function buildResourcePlan(args: {
  live: LiveResourceForPlan;
  snapshot: ResourceSnapshot;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];
  planResourceFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
