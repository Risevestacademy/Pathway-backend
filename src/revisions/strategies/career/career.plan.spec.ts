import { describe, expect, it } from '@jest/globals';
import type { CareerSnapshot, LiveCareerForPlan } from './career.types';
import { buildCareerPlan } from './career.plan';

// ─────────────────────────────────────────────────────────────────────
// Fixtures
//
// `seed()` returns a live career + snapshot that match exactly, so a plan
// against them produces zero operations and zero blockers. Tests mutate one
// side (usually the snapshot) and assert on the delta.
//
// All `skillId` values are opaque strings; the career strategy does not
// resolve them (the SKILL strategy owns Skill rows; the career strategy
// only owns CareerSkill links, FK-enforced at apply time).
// ─────────────────────────────────────────────────────────────────────

const liveCareer = (
  overrides: Partial<LiveCareerForPlan> = {},
): LiveCareerForPlan => ({
  id: 'career-1',
  version: 3,
  title: 'Electrician',
  slug: 'electrician',
  description: 'Wires buildings.',
  roleSummary: 'Installs and maintains electrical systems.',
  fieldId: 'field-1',
  targetLevels: ['STUDENT'],
  exampleActivities: ['Wire a house'],
  typicalEducationNote: 'Apprenticeship',
  certificationsNote: null,
  skills: [
    { skillId: 'skill-a', importance: 'REQUIRED' },
    { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
  ],
  ...overrides,
});

const snapshot = (overrides: Partial<CareerSnapshot> = {}): CareerSnapshot => ({
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
  skills: [
    { skillId: 'skill-a', importance: 'REQUIRED' },
    { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
  ],
  ...overrides,
});

const plan = (
  live: LiveCareerForPlan,
  snap: CareerSnapshot,
  baseVersion = live.version,
) => buildCareerPlan({ liveCareer: live, snapshot: snap, baseVersion });

// ─────────────────────────────────────────────────────────────────────
// Career scalar / array fields
// ─────────────────────────────────────────────────────────────────────

describe('buildCareerPlan › career fields', () => {
  it('emits one update for a changed scalar field', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.career.description = 'Wires buildings and fixes faults.';

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'career',
        entityId: 'career-1',
        field: 'description',
        before: 'Wires buildings.',
        after: 'Wires buildings and fixes faults.',
      },
    ]);
  });

  it('emits one update for a changed array field (targetLevels)', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.career.targetLevels = ['STUDENT', 'EARLY_CAREER'];

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'career',
        entityId: 'career-1',
        field: 'targetLevels',
        before: ['STUDENT'],
        after: ['STUDENT', 'EARLY_CAREER'],
      },
    ]);
  });

  it('emits one update for a changed array field (exampleActivities)', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.career.exampleActivities = ['Wire a house', 'Install a panel'];

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'career',
        entityId: 'career-1',
        field: 'exampleActivities',
        before: ['Wire a house'],
        after: ['Wire a house', 'Install a panel'],
      },
    ]);
  });

  it('emits a MISSING_CAREER_FIELD blocker when a required field is empty', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.career.title = '';

    const { operations, blockers } = plan(live, snap);

    // The blocker is what makes submit fail.
    expect(blockers).toEqual([
      {
        code: 'MISSING_CAREER_FIELD',
        message: 'Career field "title" is required',
        section: 'career',
        entityId: 'career-1',
      },
    ]);

    // The update is still emitted: the snapshot's '' differs from the live
    // "Electrician". The two coexist deliberately — plan reports the full
    // picture; the envelope's submit hard-fails on the blocker, so the
    // update is never applied. On publish, an apply against an invalid
    // snapshot is impossible by construction.
    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'career',
        entityId: 'career-1',
        field: 'title',
        before: 'Electrician',
        after: '',
      },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Career skills (the CareerSkill link-set)
// ─────────────────────────────────────────────────────────────────────

describe('buildCareerPlan › skills', () => {
  it('emits a link for an added skill', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.skills.push({ skillId: 'skill-c', importance: 'REQUIRED' });

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'link',
        section: 'skills',
        entityId: 'skill-c',
        after: { skillId: 'skill-c', importance: 'REQUIRED' },
      },
    ]);
  });

  it('emits an update when a skill importance changes', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.skills[1].importance = 'REQUIRED';

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'skills',
        entityId: 'skill-b',
        field: 'importance',
        before: 'NICE_TO_HAVE',
        after: 'REQUIRED',
      },
    ]);
  });

  it('emits an unlink for a removed skill', () => {
    const live = liveCareer();
    const snap = snapshot();
    snap.skills = snap.skills.filter((s) => s.skillId !== 'skill-b');

    const { operations } = plan(live, snap);

    expect(operations).toEqual([
      {
        kind: 'unlink',
        section: 'skills',
        entityId: 'skill-b',
        before: { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
      },
    ]);
  });

  it('emits a NO_SKILLS blocker when the snapshot has no skills', () => {
    const live = liveCareer({ skills: [] });
    const snap = snapshot({ skills: [] });

    const { blockers, operations } = plan(live, snap);

    expect(blockers).toEqual([
      {
        code: 'NO_SKILLS',
        message: 'Career must have at least one skill',
        section: 'skills',
      },
    ]);
    expect(operations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// No-change / staleness / counts
// ─────────────────────────────────────────────────────────────────────

describe('buildCareerPlan › no-change and envelope', () => {
  it('emits zero operations and zero blockers when nothing changed', () => {
    const live = liveCareer();
    const snap = snapshot();

    const result = plan(live, snap);

    expect(result.operations).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.counts).toEqual({
      added: 0,
      changed: 0,
      moved: 0,
      removed: 0,
      blockers: 0,
    });
  });

  it('stale is false when baseVersion equals live version', () => {
    const live = liveCareer({ version: 3 });
    const snap = snapshot();

    const result = plan(live, snap, 3);

    expect(result.stale).toBe(false);
    expect(result.baseVersion).toBe(3);
    expect(result.liveVersion).toBe(3);
  });

  it('stale is true when baseVersion is behind live version', () => {
    const live = liveCareer({ version: 3 });
    const snap = snapshot();

    const result = plan(live, snap, 2);

    expect(result.stale).toBe(true);
  });

  it('stale is false when baseVersion is ahead of live version (defensive)', () => {
    const live = liveCareer({ version: 3 });
    const snap = snapshot();

    const result = plan(live, snap, 4);

    expect(result.stale).toBe(false);
  });

  it('counts aggregate operations and blockers by kind', () => {
    const live = liveCareer();
    const snap = snapshot();
    // One update (description), one link (skill-c), one unlink (skill-b).
    snap.career.description = 'Changed.';
    snap.skills = [
      { skillId: 'skill-a', importance: 'REQUIRED' },
      { skillId: 'skill-c', importance: 'NICE_TO_HAVE' },
    ];

    const { counts } = plan(live, snap);

    expect(counts).toEqual({
      added: 1,
      changed: 1,
      moved: 0,
      removed: 1,
      blockers: 0,
    });
  });
});
