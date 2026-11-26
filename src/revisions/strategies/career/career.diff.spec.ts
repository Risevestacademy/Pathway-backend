import { describe, expect, it } from '@jest/globals';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import type { CareerSnapshot } from './career.types';
import { careerDiffSections } from './career.diff';

// ─────────────────────────────────────────────────────────────────────
// `careerDiffSections` is a pure derivation: plan.operations → SectionChanges[].
// No DB, no ctx. The post-shrink career plan emits `career`, `skills`, and
// `outlook` operations; the diff's `create`/`move`/`delete`/`link`/`unlink`
// branches are covered here for the sections the career plan still emits
// (`skills`, `outlook`, career). `move` is exercised by the PATHWAY_STEP
// strategy's diff tests in Phase D — not here.
// ─────────────────────────────────────────────────────────────────────

const snapshot = (): CareerSnapshot => ({
  schemaVersion: 1,
  career: {
    title: 'Electrician',
    slug: 'electrician',
    description: 'Wires buildings.',
    roleSummary: 'Installs and maintains electrical systems.',
    fieldId: 'field-1',
    targetLevels: ['STUDENT'],
    exampleActivities: ['Wire a house'],
    typicalEducationNote: 'Apprenticeship',
    certificationsNote: null,
  },
  skills: [{ skillId: 'skill-a', importance: 'REQUIRED' }],
});

const plan = (operations: PlanOperation[]): RevisionPlan => ({
  operations,
  blockers: [],
  advisories: [],
  stale: false,
});

describe('careerDiffSections', () => {
  it('renders one update as one section with one EntityChange and one FieldChange', () => {
    const sections = careerDiffSections(
      plan([
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'description',
          before: 'Old.',
          after: 'New.',
        },
      ]),
      snapshot(),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].section).toBe('career');
    expect(sections[0].contentType).toBe('CAREER');
    expect(sections[0].changed).toHaveLength(1);
    expect(sections[0].changed[0]).toEqual({
      entityId: 'career-1',
      entityTitle: 'Electrician',
      changes: [
        {
          field: 'description',
          label: 'Description',
          before: 'Old.',
          after: 'New.',
        },
      ],
    });
    expect(sections[0].added).toEqual([]);
    expect(sections[0].removed).toEqual([]);
    expect(sections[0].moved).toEqual([]);
  });

  it('collapses two updates on the same entity into one EntityChange with two FieldChanges', () => {
    const sections = careerDiffSections(
      plan([
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'description',
          before: 'Old.',
          after: 'New.',
        },
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'roleSummary',
          before: 'Old summary.',
          after: 'New summary.',
        },
      ]),
      snapshot(),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].changed).toHaveLength(1);
    expect(sections[0].changed[0].changes).toHaveLength(2);
    expect(sections[0].changed[0].changes.map((c) => c.field)).toEqual([
      'description',
      'roleSummary',
    ]);
  });

  it('renders a create as an added EntityRef', () => {
    const sections = careerDiffSections(
      plan([
        {
          kind: 'create',
          section: 'outlook',
          entityId: 'outlook-1',
          after: { id: 'outlook-1', geography: 'UK' },
        },
      ]),
      snapshot(),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].section).toBe('outlook');
    expect(sections[0].added).toEqual([
      { id: 'outlook-1', title: 'outlook-1' },
    ]);
    expect(sections[0].removed).toEqual([]);
    expect(sections[0].changed).toEqual([]);
  });

  it('renders a delete as a removed EntityRef', () => {
    const sections = careerDiffSections(
      plan([
        {
          kind: 'delete',
          section: 'outlook',
          entityId: 'outlook-1',
          before: { id: 'outlook-1', geography: 'UK' },
        },
      ]),
      snapshot(),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].removed).toEqual([
      { id: 'outlook-1', title: 'outlook-1' },
    ]);
  });

  it('sets contentType CAREER on every section', () => {
    const sections = careerDiffSections(
      plan([
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'description',
          before: 'a',
          after: 'b',
        },
        {
          kind: 'link',
          section: 'skills',
          entityId: 'skill-a',
          after: { skillId: 'skill-a', importance: 'REQUIRED' },
        },
      ]),
      snapshot(),
    );

    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(s.contentType).toBe('CAREER');
    }
  });

  it('returns an empty array for an empty plan', () => {
    expect(careerDiffSections(plan([]), snapshot())).toEqual([]);
  });
});
