import type {
  EntityChange,
  PlanSection,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import { PATHWAY_STEP_STRATEGY_FIELD_LABELS } from './pathway-step.config';
import type { PathwayStepSnapshot } from './pathway-step.types';

const emptySection = (section: PlanSection): SectionChanges => ({
  section,
  contentType: 'PATHWAY_STEP',
  changed: [],
  added: [],
  removed: [],
  moved: [],
});

/**
 * Renders the step's field changes under `steps`, and link/unlink operations as
 * added/removed entries under `stepSkills` and `stepResources`. Added and
 * removed links are labelled with their id; resolving skill and resource names
 * is not done here (the career diff does the same).
 */
export function stepDiffSections(
  plan: RevisionPlan,
  snapshot: PathwayStepSnapshot,
): SectionChanges[] {
  const sections: SectionChanges[] = [];

  const updates = plan.operations.filter(
    (op) => op.section === 'steps' && op.kind === 'update' && op.field,
  );
  if (updates.length > 0) {
    const entity: EntityChange = {
      entityId: updates[0].entityId ?? 'steps',
      entityTitle: snapshot.title,
      changes: updates.map((op) => ({
        field: op.field!,
        label: PATHWAY_STEP_STRATEGY_FIELD_LABELS[op.field!] ?? op.field!,
        before: op.before,
        after: op.after,
      })),
    };
    sections.push({ ...emptySection('steps'), changed: [entity] });
  }

  for (const section of ['stepSkills', 'stepResources'] as const) {
    const links = plan.operations.filter(
      (op) =>
        op.section === section && (op.kind === 'link' || op.kind === 'unlink'),
    );
    if (links.length === 0) continue;
    const out = emptySection(section);
    for (const op of links) {
      const ref = { id: op.entityId ?? '', title: op.entityId ?? 'Unknown' };
      if (op.kind === 'link') out.added.push(ref);
      else out.removed.push(ref);
    }
    sections.push(out);
  }

  return sections;
}
