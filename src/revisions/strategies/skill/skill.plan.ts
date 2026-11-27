import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import {
  compareFields,
  missingRequiredFields,
} from '../../envelope/field-compare';
import { SKILL_FIELD_CONFIG } from './skill.config';
import type { LiveSkillForPlan, SkillSnapshot } from './skill.types';

export function planSkillFields(
  live: LiveSkillForPlan,
  snapshot: SkillSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  for (const entry of missingRequiredFields(SKILL_FIELD_CONFIG, snapshot)) {
    blockers.push({
      code: 'MISSING_SKILL_FIELD',
      message: `Skill field "${entry.field}" is required`,
      section: 'skills',
      entityId: live.id,
    });
  }

  compareFields(SKILL_FIELD_CONFIG, live, snapshot, live.id, operations);
}

export function buildSkillPlan(args: {
  live: LiveSkillForPlan;
  snapshot: SkillSnapshot;
}): { operations: PlanOperation[]; blockers: PlanBlocker[] } {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];
  planSkillFields(args.live, args.snapshot, operations, blockers);
  return { operations, blockers };
}
