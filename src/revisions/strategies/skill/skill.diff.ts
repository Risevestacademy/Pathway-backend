import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { SKILL_STRATEGY_FIELD_LABELS } from './skill.config';
import type { SkillSnapshot } from './skill.types';

export function skillDiffSections(
  plan: RevisionPlan,
  snapshot: SkillSnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'skills' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entity: EntityChange = {
    entityId: updates[0].entityId ?? 'skills',
    entityTitle: snapshot.name,
    changes: updates.map((op) => ({
      field: op.field!,
      label: SKILL_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'skills',
      contentType: 'SKILL',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
