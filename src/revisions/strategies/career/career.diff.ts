// ─────────────────────────────────────────────────────────────────────
// Phase A amendment (T0.5): the career plan now emits only `career`,
// `skills`, and `outlook` operations. The `pathway` branch is removed.
// The `steps`/`resources` branches are kept as generic fall-throughs
// (they cost nothing and the PATHWAY_STEP/RESOURCE strategies will copy
// this file); they simply never fire for a career plan anymore.
//
// This function is pure — no DB. `DiffContext` no longer carries `prisma`
// after Phase C, and this file never used it.
// ─────────────────────────────────────────────────────────────────────

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
        // A field change on an existing entity. Group by entity so the
        // frontend sees one row per entity.
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
 * when the plan sets it; the config-driven plan doesn't set it, so we fall
 * back to a title-cased field name.
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
 * - any other section: the entity's own `title` from `after` (created or
 *   updated entity) or `before` (deleted entity), falling back to the
 *   entity ID.
 *
 * `skills` and `outlook` entities have no `title` field; they fall back to
 * the entity ID. That is the honest fallback — the diff renderer will
 * resolve real labels when those strategies exist.
 */
function titleForOperation(
  op: PlanOperation,
  snapshot: CareerSnapshot,
): string {
  if (op.section === 'career') {
    return snapshot.career.title;
  }

  if (isRecord(op.after) && typeof op.after.title === 'string') {
    return op.after.title;
  }
  if (isRecord(op.before) && typeof op.before.title === 'string') {
    return op.before.title;
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
