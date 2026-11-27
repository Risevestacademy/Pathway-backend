import type {
  EntityChange,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { OUTLOOK_STRATEGY_FIELD_LABELS } from './outlook.config';
import { outlookTitle } from './outlook.title';
import type { OutlookSnapshot } from './outlook.types';

export function outlookDiffSections(
  plan: RevisionPlan,
  snapshot: OutlookSnapshot,
): SectionChanges[] {
  const updates = plan.operations.filter(
    (op) => op.section === 'outlook' && op.kind === 'update' && op.field,
  );
  if (updates.length === 0) return [];

  const entityId = updates[0].entityId ?? 'outlook';
  const entity: EntityChange = {
    entityId,
    entityTitle: outlookTitle(snapshot, entityId),
    changes: updates.map((op) => ({
      field: op.field!,
      label: OUTLOOK_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
      before: op.before,
      after: op.after,
    })),
  };

  return [
    {
      section: 'outlook',
      contentType: 'OUTLOOK',
      changed: [entity],
      added: [],
      removed: [],
      moved: [],
    },
  ];
}
