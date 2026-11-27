import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { PATHWAY_STRATEGY_FIELD_LABELS } from './pathway.config';
import type { PathwaySnapshot } from './pathway.types';

export function pathwayDiffSections(
  plan: RevisionPlan,
  snapshot: PathwaySnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'pathway' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entity: EntityChange = {
    entityId: updates[0].entityId ?? 'pathway',
    entityTitle: snapshot.title,
    changes: updates.map((op) => ({
      field: op.field!,
      label: PATHWAY_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'pathway',
      contentType: 'PATHWAY',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
