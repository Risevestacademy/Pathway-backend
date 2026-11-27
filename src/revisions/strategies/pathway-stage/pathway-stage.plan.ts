import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { PATHWAY_STAGE_FIELD_CONFIG } from './pathway-stage.config';
import type {
  LivePathwayStageForPlan,
  PathwayStageSnapshot,
} from './pathway-stage.types';

export function planStageFields(
  live: LivePathwayStageForPlan,
  snapshot: PathwayStageSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(
    PATHWAY_STAGE_FIELD_CONFIG,
    snapshot,
  )) {
    blockers.push({
      code: 'MISSING_STAGE_FIELD',
      message: `Stage field "${entry.field}" is required`,
      section: 'stages',
      entityId: live.id,
    });
  }

  compareFields(
    PATHWAY_STAGE_FIELD_CONFIG,
    live,
    snapshot,
    live.id,
    operations,
  );
}

export function buildStagePlan(args: {
  live: LivePathwayStageForPlan;
  snapshot: PathwayStageSnapshot;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  // An order edit is blocked, never silently dropped. No move operation is
  // emitted: order is not in the config, so compareFields cannot produce one.
  // A snapshot that omits order is treated as unchanged, like any other field.
  if (
    typeof args.snapshot.order === 'number' &&
    args.snapshot.order !== args.live.order
  ) {
    blockers.push({
      code: 'SIBLING_REORDER_NOT_SUPPORTED',
      message: `Stage order cannot be changed in a stage revision (live ${args.live.order}, draft ${args.snapshot.order})`,
      section: 'stages',
      entityId: args.live.id,
    });
  }

  planStageFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
