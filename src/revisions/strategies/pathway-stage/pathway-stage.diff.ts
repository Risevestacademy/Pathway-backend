import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { PATHWAY_STAGE_STRATEGY_FIELD_LABELS } from './pathway-stage.config';
import type { PathwayStageSnapshot } from './pathway-stage.types';

export function stageDiffSections(
  plan: RevisionPlan,
  snapshot: PathwayStageSnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'stages' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entity: EntityChange = {
    entityId: updates[0].entityId ?? 'stages',
    entityTitle: snapshot.title,
    changes: updates.map((op) => ({
      field: op.field!,
      label: PATHWAY_STAGE_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'stages',
      contentType: 'PATHWAY_STAGE',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
