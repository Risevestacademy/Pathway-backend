import { describe, expect, it } from '@jest/globals';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { PATHWAY_STEP_FIELD_CONFIG } from './pathway-step.config';
import { PathwayStepRevisionStrategy } from './pathway-step.strategy';
import type {
  LivePathwayStepForPlan,
  PathwayStepSnapshot,
} from './pathway-step.types';

const baseSnapshot = (): PathwayStepSnapshot => ({
  schemaVersion: 1,
  title: 'Learn circuits',
  description: 'Basics of circuits.',
  learningObjective: 'Read a circuit diagram',
  prerequisites: null,
  expectedActivity: 'Build a simple circuit',
  stageId: null,
  order: 1,
  skillIds: ['skill-a'],
  resourceIds: [],
});

const liveFromSnapshot = (s: PathwayStepSnapshot): LivePathwayStepForPlan => ({
  id: 'step-1',
  stageId: s.stageId,
  title: s.title,
  description: s.description,
  learningObjective: s.learningObjective,
  prerequisites: s.prerequisites,
  expectedActivity: s.expectedActivity,
  order: s.order,
  skills: s.skillIds.map((skillId) => ({ skillId })),
  resources: s.resourceIds.map((resourceId) => ({ resourceId })),
});

const stepSeed: ConformanceSeed<PathwayStepSnapshot, LivePathwayStepForPlan> = {
  contentId: 'step-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), title: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), learningObjective: 'Changed' },
    changedField: 'learningObjective',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.pathwayStep.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new PathwayStepRevisionStrategy(),
  seed: stepSeed,
});

const strategy = new PathwayStepRevisionStrategy();
const emptyPlan = {
  operations: [],
  blockers: [],
  advisories: [],
  stale: false,
};
const ctx = {
  revisionId: 'revision-1',
  baseVersion: 0,
  liveVersion: 0,
  sessionId: 'session-1',
};

describe('PathwayStepRevisionStrategy', () => {
  describe('config', () => {
    it('lists the step columns, with title, learningObjective and expectedActivity required', () => {
      expect(PATHWAY_STEP_FIELD_CONFIG.map((e) => e.field)).toEqual([
        'title',
        'description',
        'learningObjective',
        'prerequisites',
        'expectedActivity',
        'stageId',
      ]);
      expect(
        PATHWAY_STEP_FIELD_CONFIG.filter((e) => e.required).map((e) => e.field),
      ).toEqual(['title', 'learningObjective', 'expectedActivity']);
    });

    it('leaves out order, the link-sets and pathwayId', () => {
      const fields = PATHWAY_STEP_FIELD_CONFIG.map((e) => e.field);
      for (const left of ['order', 'skillIds', 'resourceIds', 'pathwayId']) {
        expect(fields).not.toContain(left);
      }
    });
  });

  describe('validate', () => {
    it.each(['title', 'learningObjective', 'expectedActivity'])(
      'reports an empty %s',
      (field) => {
        expect(strategy.validate({ ...baseSnapshot(), [field]: '' })).toEqual([
          `${field}: required`,
        ]);
      },
    );

    it('accepts null optional fields and empty link-sets', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          description: null,
          prerequisites: null,
          stageId: null,
          skillIds: [],
          resourceIds: [],
        }),
      ).toEqual([]);
    });

    it('rejects duplicate ids in either link-set', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          skillIds: ['a', 'a'],
          resourceIds: ['r', 'r'],
        }),
      ).toEqual([
        'skillIds: must not contain duplicates',
        'resourceIds: must not contain duplicates',
      ]);
    });

    it('rejects temp ids, which would make plan throw', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          skillIds: ['new-1'],
          resourceIds: ['new-2'],
        }),
      ).toEqual([
        'skillIds: must be existing ids, not new-* temp ids',
        'resourceIds: must be existing ids, not new-* temp ids',
      ]);
    });

    it('rejects a missing or non-list link-set, which would otherwise unlink everything', () => {
      const { skillIds: _skillIds, ...rest } = baseSnapshot();
      expect(
        strategy.validate({
          ...rest,
          resourceIds: 'r' as unknown as string[],
        } as PathwayStepSnapshot),
      ).toEqual([
        'skillIds: must be a list of strings',
        'resourceIds: must be a list of strings',
      ]);
    });
  });

  describe('plan', () => {
    it('blocks with PATHWAY_STEP_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_STEP_NOT_FOUND',
            message: 'Pathway step not found',
            section: 'steps',
          },
        ],
        advisories: [],
        stale: false,
      });
    });
  });

  describe('diff', () => {
    it('renders one changed field and one added skill, each in its own section', async () => {
      const live = liveFromSnapshot(baseSnapshot());
      const snapshot = {
        ...baseSnapshot(),
        learningObjective: 'Read and draw circuit diagrams',
        skillIds: ['skill-a', 'skill-b'],
      };
      const plan = strategy.plan(live, snapshot, 0);

      const sections = await strategy.diff(plan, snapshot, ctx);

      expect(sections).toEqual([
        {
          section: 'steps',
          contentType: 'PATHWAY_STEP',
          changed: [
            {
              entityId: 'step-1',
              entityTitle: 'Learn circuits',
              changes: [
                {
                  field: 'learningObjective',
                  label: 'Learning Objective',
                  before: 'Read a circuit diagram',
                  after: 'Read and draw circuit diagrams',
                },
              ],
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
        {
          section: 'stepSkills',
          contentType: 'PATHWAY_STEP',
          changed: [],
          added: [{ id: 'skill-b', title: 'skill-b' }],
          removed: [],
          moved: [],
        },
      ]);
    });

    it('renders unlinked resources as removed under stepResources', async () => {
      const live = {
        ...liveFromSnapshot(baseSnapshot()),
        resources: [{ resourceId: 'res-1' }],
      };
      const plan = strategy.plan(live, baseSnapshot(), 0);

      const sections = await strategy.diff(plan, baseSnapshot(), ctx);

      expect(sections).toEqual([
        {
          section: 'stepResources',
          contentType: 'PATHWAY_STEP',
          changed: [],
          added: [],
          removed: [{ id: 'res-1', title: 'res-1' }],
          moved: [],
        },
      ]);
    });

    it('returns no sections for an empty plan', async () => {
      expect(await strategy.diff(emptyPlan, baseSnapshot(), ctx)).toEqual([]);
    });
  });

  describe('titleFor', () => {
    it('reads the title', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('Learn circuits');
    });

    it('falls back to Unknown', () => {
      expect(strategy.titleFor(null)).toBe('Unknown');
      expect(strategy.titleFor({ title: '' })).toBe('Unknown');
    });
  });

  it('declares no temp-id fields and touches no nested roots', () => {
    expect(strategy.tempIdFields).toEqual([]);
    expect(strategy.nestedRootsTouched(emptyPlan)).toEqual([]);
  });
});
