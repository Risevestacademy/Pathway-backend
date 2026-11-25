import type {
  EntityChange,
  PlanOperation,
  PlanSection,
  RevisionPlan,
  SectionChanges,
} from '../../envelope/strategy.types';
import type { CareerSnapshot } from './career.types';

/**
 * Render a career revision plan as SectionChanges.
 *
 * Pure derivation from plan.operations. Does not touch the old
 * ReviewerDiffFormatter — that formatter belonged to the old career-only
 * response shape and is being retired. The new session diff contract
 * (SectionChanges[] with contentType, grouping by entity) is what we emit
 * here, from the plan's own data.
 *
 * The strategy's `diff` interface allows this function to be pure (no DB
 * access); `ctx.prisma` is unused here because the career strategy does not
 * need to resolve any foreign-key labels. When T1 splits other strategies
 * out, those strategies may query for labels; this one does not.
 */
export function careerDiffSections(
  plan: RevisionPlan,
  snapshot: CareerSnapshot,
): SectionChanges[] {
  // Bucket operations by section, then fold into a SectionChanges per
  // section. Two updates to the same entity in the same section collapse
  // into one EntityChange with multiple FieldChange entries.
  const bySection = new Map<PlanSection, SectionChanges>();

  const getSection = (section: PlanSection): SectionChanges => {
    let s = bySection.get(section);
    if (!s) {
      s = {
        section,
        contentType: 'CAREER',
        changed: [],
        added: [],
        removed: [],
        moved: [],
      };
      bySection.set(section, s);
    }
    return s;
  };

  const getOrCreateEntityChange = (
    section: SectionChanges,
    entityId: string,
    entityTitle: string,
  ): EntityChange => {
    const existing = section.changed.find((c) => c.entityId === entityId);
    if (existing) return existing;
    const created: EntityChange = {
      entityId,
      entityTitle,
      changes: [],
    };
    section.changed.push(created);
    return created;
  };

  for (const op of plan.operations) {
    const section = getSection(op.section);

    switch (op.kind) {
      case 'update': {
        // A field change on an existing entity. The strategy's plan emits
        // `update` for scalar fields on career, pathway, outlook, and step
        // entities. Group by entity so the frontend sees one row per entity.
        if (!op.field) break; // safety: an update without a field is a plan bug
        const entityId = op.entityId ?? section.section;
        const entityTitle = titleForOperation(op, snapshot);
        const change = getOrCreateEntityChange(section, entityId, entityTitle);
        change.changes.push({
          field: op.field,
          label: labelFor(op),
          before: op.before,
          after: op.after,
        });
        break;
      }

      case 'create': {
        // A new entity. `entityId` may be a temp ID (new-N) for resources
        // or steps; for outlook it's the same. Title comes from `after`.
        const id = op.entityId ?? '';
        section.added.push({
          id,
          title: titleForOperation(op, snapshot),
        });
        break;
      }

      case 'delete': {
        const id = op.entityId ?? '';
        section.removed.push({
          id,
          title: titleForOperation(op, snapshot),
        });
        break;
      }

      case 'move': {
        const id = op.entityId ?? '';
        const before = typeof op.before === 'number' ? op.before : 0;
        const after = typeof op.after === 'number' ? op.after : 0;
        section.moved.push({
          id,
          title: titleForOperation(op, snapshot),
          fromOrder: before,
          toOrder: after,
        });
        break;
      }

      case 'link': {
        // A new link (skill, resource, step-skill, step-resource). Render
        // as an `added` entity in that section.
        const id = op.entityId ?? '';
        section.added.push({
          id,
          title: titleForOperation(op, snapshot),
        });
        break;
      }

      case 'unlink': {
        const id = op.entityId ?? '';
        section.removed.push({
          id,
          title: titleForOperation(op, snapshot),
        });
        break;
      }
    }
  }

  // Return sections in a stable order. bySection preserves insertion order
  // (Map iteration), which follows plan.operations order. That's fine; the
  // frontend groups by section name for display and doesn't depend on
  // ordering across sections.
  return Array.from(bySection.values());
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Human-readable label for a field change. Uses the operation's `label`
 * when the plan sets it (the old config-driven plan doesn't, so we fall
 * back to a title-cased field name). The career strategy's
 * `CAREER_STRATEGY_FIELD_LABELS` has the canonical labels and could be
 * used here if the strategy passes them through; until it does, this is
 * good enough and only affects display.
 */
function labelFor(op: PlanOperation): string {
  if (op.label) return op.label;
  return titleCase(op.field ?? '');
}

/**
 * Human-readable title for a section's entity, used in added/removed/moved
 * entries.
 *
 * - career: the snapshot's career title.
 * - pathway: the snapshot's pathway title.
 * - steps/outlook/resources: the entity's own title, from `after` (for
 *   created/updated) or `before` (for deleted).
 * - skills: no title in scope; use the skill ID.
 * - any other section: the entity ID.
 */
function titleForOperation(
  op: PlanOperation,
  snapshot: CareerSnapshot,
): string {
  if (op.section === 'career') {
    return snapshot.career.title;
  }
  if (op.section === 'pathway') {
    if (snapshot.pathway?.title) return snapshot.pathway.title;
    if (isRecord(op.after) && typeof op.after.title === 'string') {
      return op.after.title;
    }
    if (isRecord(op.before) && typeof op.before.title === 'string') {
      return op.before.title;
    }
    return 'Pathway';
  }

  // For entity-bearing sections, prefer `after.title` (created/updated
  // entity), then `before.title` (removed entity), then the entity ID.
  if (isRecord(op.after) && typeof op.after.title === 'string') {
    return op.after.title;
  }
  if (isRecord(op.before) && typeof op.before.title === 'string') {
    return op.before.title;
  }

  if (op.section === 'skills') {
    // No skill name in scope; the ID is the honest fallback.
    return op.entityId ?? 'Skill';
  }

  return op.entityId ?? 'Unknown';
}

function titleCase(s: string): string {
  if (!s) return '';
  return s
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
