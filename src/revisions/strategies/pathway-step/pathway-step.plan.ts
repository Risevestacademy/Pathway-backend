import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  compareLinkSet,
  missingRequiredFields,
  type FieldConfigEntry,
} from '../../envelope/field-compare';
import { PATHWAY_STEP_FIELD_CONFIG } from './pathway-step.config';
import type {
  LivePathwayStepForPlan,
  PathwayStepSnapshot,
} from './pathway-step.types';

const STEP_SKILLS: FieldConfigEntry = {
  field: 'skillIds',
  kind: 'link-set',
  section: 'stepSkills',
  label: 'Skills',
  linkLive: 'skills',
  linkSnapshot: 'skillIds',
};

// the link carries no payload in v1, so this is a
// plain link-set. A link created by a revision has a null usageNote, and
// unlinking then re-linking a resource loses its note.

const STEP_RESOURCES: FieldConfigEntry = {
  field: 'resourceIds',
  kind: 'link-set',
  section: 'stepResources',
  label: 'Resources',
  linkLive: 'resources',
  linkSnapshot: 'resourceIds',
};

export function planStepFields(
  live: LivePathwayStepForPlan,
  snapshot: PathwayStepSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(
    PATHWAY_STEP_FIELD_CONFIG,
    snapshot,
  )) {
    blockers.push({
      code: 'MISSING_STEP_FIELD',
      message: `Step field "${entry.field}" is required`,
      section: 'steps',
      entityId: live.id,
    });
  }

  compareFields(PATHWAY_STEP_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function planStepSkills(
  live: LivePathwayStepForPlan,
  snapshot: PathwayStepSnapshot,
  operations: PlanOperation[],
): void {
  compareLinkSet(STEP_SKILLS, live, snapshot, live.id, operations, false);
}

export function planStepResources(
  live: LivePathwayStepForPlan,
  snapshot: PathwayStepSnapshot,
  operations: PlanOperation[],
): void {
  compareLinkSet(STEP_RESOURCES, live, snapshot, live.id, operations, false);
}

export function buildStepPlan(args: {
  live: LivePathwayStepForPlan;
  snapshot: PathwayStepSnapshot;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  // Step order is not editable. A changed order is blocked, never
  // silently dropped, and no move operation is emitted: order is not in the
  // config. A snapshot that omits order is treated as unchanged.
  if (
    typeof args.snapshot.order === 'number' &&
    args.snapshot.order !== args.live.order
  ) {
    blockers.push({
      code: 'SIBLING_REORDER_NOT_SUPPORTED',
      message: `Step order cannot be changed in a step revision (live ${args.live.order}, draft ${args.snapshot.order})`,
      section: 'steps',
      entityId: args.live.id,
    });
  }

  planStepFields(args.live, args.snapshot, operations, blockers);
  planStepSkills(args.live, args.snapshot, operations);
  planStepResources(args.live, args.snapshot, operations);
  return { operations, blockers };
}
