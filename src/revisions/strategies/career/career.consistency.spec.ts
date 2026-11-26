import { describe, expect, it } from '@jest/globals';
import type { CareerSnapshot } from './career.types';
import { findSnapshotProblems } from './career.consistency';

// ─────────────────────────────────────────────────────────────────────
// After the Phase A shrink, the career snapshot contains only career fields
// and the CareerSkill link-set. The only structural check left is duplicate
// skill IDs; the pathway/steps/resources/outlook checks moved out with their
// aggregates.
// ─────────────────────────────────────────────────────────────────────

const validSnapshot = (): CareerSnapshot => ({
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
});

describe('findSnapshotProblems', () => {
  it('returns no problems for a valid snapshot', () => {
    expect(findSnapshotProblems(validSnapshot())).toEqual([]);
  });

  it('reports a duplicate skill ID', () => {
    const snap = validSnapshot();
    snap.skills.push({ skillId: 'skill-a', importance: 'NICE_TO_HAVE' });

    const problems = findSnapshotProblems(snap);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^skills\.2: duplicate skillId of skills\.0$/);
  });

  it('reports each duplicate occurrence separately', () => {
    // Three occurrences of the same skillId: the second and third are each
    // flagged, both pointing at the first.
    const snap = validSnapshot();
    snap.skills = [
      { skillId: 'skill-a', importance: 'REQUIRED' },
      { skillId: 'skill-a', importance: 'NICE_TO_HAVE' },
      { skillId: 'skill-a', importance: 'NICE_TO_HAVE' },
    ];

    const problems = findSnapshotProblems(snap);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^skills\.1: duplicate skillId of skills\.0$/);
    expect(problems[1]).toMatch(/^skills\.2: duplicate skillId of skills\.0$/);
  });
});
