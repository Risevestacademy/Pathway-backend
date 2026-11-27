import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { SOURCE_STRATEGY_FIELD_LABELS } from './source.config';
import type { SourceSnapshot } from './source.types';

export function sourceDiffSections(
  plan: RevisionPlan,
  snapshot: SourceSnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'sources' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entity: EntityChange = {
    entityId: updates[0].entityId ?? 'sources',
    entityTitle: snapshot.name,
    changes: updates.map((op) => ({
      field: op.field!,
      label: SOURCE_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'sources',
      contentType: 'SOURCE',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
