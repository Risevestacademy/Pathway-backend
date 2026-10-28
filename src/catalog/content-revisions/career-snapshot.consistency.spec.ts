import { describe, expect, it } from '@jest/globals';
import { findSnapshotProblems } from './career-snapshot.consistency';
import type {
  CareerSnapshot,
  CareerSnapshotResource,
  CareerSnapshotStep,
} from './career-snapshot.types';

const SKILL_A = '11111111-1111-4111-8111-111111111111';
const SKILL_B = '22222222-2222-4222-8222-222222222222';
const SHARED_RESOURCE = '33333333-3333-4333-8333-333333333333';

const step = (overrides: Partial<CareerSnapshotStep>): CareerSnapshotStep => ({
  id: 'new-1',
  order: 1,
  title: 'Step',
  description: null,
  learningObjective: 'lo',
  prerequisites: null,
  expectedActivity: 'ea',
  skillIds: [],
  resourceIds: [],
  ...overrides,
});

const resource = (id: string): CareerSnapshotResource => ({
  id,
  title: 'Resource',
  description: null,
  url: 'https://example.com',
  type: 'COURSE',
  provider: 'Example',
  costStatus: 'FREE',
  certificationCost: null,
  curationRationale: 'Good',
  lastCheckedDate: '2026-10-01',
});

const snapshot = (overrides: Partial<CareerSnapshot>): CareerSnapshot => ({
  schemaVersion: 1,
  career: {
    title: 'DevOps Engineer',
    slug: 'devops-engineer',
    description: 'd',
    roleSummary: null,
    fieldId: null,
    targetLevels: [],
    exampleActivities: [],
    typicalEducationNote: null,
    certificationsNote: null,
  },
  pathway: { title: 'Roadmap', description: null },
  steps: [],
  skills: [],
  outlook: [],
  resources: [],
  ...overrides,
});

describe('findSnapshotProblems', () => {
  it('returns nothing for a consistent snapshot', () => {
    expect(
      findSnapshotProblems(
        snapshot({
          steps: [
            step({
              id: 'new-1',
              order: 1,
              skillIds: [SKILL_A],
              resourceIds: ['new-1', SHARED_RESOURCE],
            }),
            step({ id: 'new-2', order: 2, skillIds: [SKILL_A] }),
          ],
          skills: [
            { skillId: SKILL_A, importance: 'REQUIRED' },
            { skillId: SKILL_B, importance: 'NICE_TO_HAVE' },
          ],
          resources: [resource('new-1')],
        }),
      ),
    ).toEqual([]);
  });

  it('returns nothing for an empty draft without a pathway', () => {
    expect(findSnapshotProblems(snapshot({ pathway: null }))).toEqual([]);
  });

  it('reports duplicate step ids and orders', () => {
    expect(
      findSnapshotProblems(
        snapshot({
          steps: [
            step({ id: 'new-1', order: 1 }),
            step({ id: 'new-1', order: 1 }),
          ],
        }),
      ),
    ).toEqual([
      'steps.1: duplicate id of steps.0',
      'steps.1: duplicate order of steps.0',
    ]);
  });

  it('reports duplicate career skills, outlook ids and resource ids', () => {
    const outlook = {
      id: 'new-1',
      type: 'DEMAND',
      geography: 'Lagos',
      period: '2026',
      sourceId: null,
      median: null,
      percentile25: null,
      percentile75: null,
      currency: null,
      payPeriod: null,
      grossOrNet: null,
      experienceLevel: null,
      baseYear: null,
      baseValue: null,
      projectedYear: null,
      projectedValue: null,
      growthPercent: null,
      demandLevel: 'HIGH',
    } as const;

    expect(
      findSnapshotProblems(
        snapshot({
          skills: [
            { skillId: SKILL_A, importance: 'REQUIRED' },
            { skillId: SKILL_A, importance: 'NICE_TO_HAVE' },
          ],
          outlook: [outlook, outlook],
          resources: [resource('new-1'), resource('new-1')],
        }),
      ),
    ).toEqual([
      'skills.1: duplicate skillId of skills.0',
      'outlook.1: duplicate id of outlook.0',
      'resources.1: duplicate id of resources.0',
    ]);
  });

  it('reports steps without a pathway', () => {
    expect(
      findSnapshotProblems(snapshot({ pathway: null, steps: [step({})] })),
    ).toEqual(['pathway: steps need a pathway']);
  });

  it('reports duplicate skills and resources within a step', () => {
    expect(
      findSnapshotProblems(
        snapshot({
          steps: [
            step({
              skillIds: [SKILL_A, SKILL_A],
              resourceIds: [SHARED_RESOURCE, SHARED_RESOURCE],
            }),
          ],
        }),
      ),
    ).toEqual([
      'steps.0.skillIds.1: duplicate skill of steps.0.skillIds.0',
      'steps.0.resourceIds.1: duplicate resource of steps.0.resourceIds.0',
    ]);
  });

  it('reports a step temp resource id missing from resources', () => {
    expect(
      findSnapshotProblems(
        snapshot({ steps: [step({ resourceIds: ['new-9'] })] }),
      ),
    ).toEqual(['steps.0.resourceIds.0: new-9 is not in resources']);
  });
});
