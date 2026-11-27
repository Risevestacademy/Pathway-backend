import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { RESOURCE_STRATEGY_FIELD_LABELS } from './resource.config';
import type { ResourceSnapshot } from './resource.types';

export function resourceDiffSections(
  plan: RevisionPlan,
  snapshot: ResourceSnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'resources' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entity: EntityChange = {
    entityId: updates[0].entityId ?? 'resources',
    entityTitle: snapshot.title,
    changes: updates.map((op) => ({
      field: op.field!,
      label: RESOURCE_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'resources',
      contentType: 'RESOURCE',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
