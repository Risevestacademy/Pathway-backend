import { describe, expect, it } from '@jest/globals';
import { buildStepPlan } from './pathway-step.plan';
import type {
  LivePathwayStepForPlan,
  PathwayStepSnapshot,
} from './pathway-step.types';

const snapshot = (
  overrides: Partial<PathwayStepSnapshot> = {},
): PathwayStepSnapshot => ({
  schemaVersion: 1,
  title: 'Learn circuits',
  description: 'Basics of circuits.',
  learningObjective: 'Read a circuit diagram',
  prerequisites: null,
  expectedActivity: 'Build a simple circuit',
  stageId: 'stage-1',
  order: 2,
  skillIds: ['skill-a', 'skill-b'],
  resourceIds: ['res-a'],
  ...overrides,
});

const live = (
  overrides: Partial<LivePathwayStepForPlan> = {},
): LivePathwayStepForPlan => ({
  id: 'step-1',
  stageId: 'stage-1',
  title: 'Learn circuits',
  description: 'Basics of circuits.',
  learningObjective: 'Read a circuit diagram',
  prerequisites: null,
  expectedActivity: 'Build a simple circuit',
  order: 2,
  skills: [{ skillId: 'skill-a' }, { skillId: 'skill-b' }],
  resources: [{ resourceId: 'res-a' }],
  ...overrides,
});

describe('buildStepPlan', () => {
  it('emits nothing when the live row matches', () => {
    expect(buildStepPlan({ live: live(), snapshot: snapshot() })).toEqual({
      operations: [],
      blockers: [],
    });
  });

  describe('fields', () => {
    it('emits one update per changed field', () => {
      const { operations, blockers } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ title: 'New', prerequisites: 'Algebra' }),
      });

      expect(operations).toEqual([
        {
          kind: 'update',
          section: 'steps',
          entityId: 'step-1',
          field: 'title',
          before: 'Learn circuits',
          after: 'New',
        },
        {
          kind: 'update',
          section: 'steps',
          entityId: 'step-1',
          field: 'prerequisites',
          before: null,
          after: 'Algebra',
        },
      ]);
      expect(blockers).toEqual([]);
    });

    it.each(['title', 'learningObjective', 'expectedActivity'] as const)(
      'emits a MISSING_STEP_FIELD blocker for an empty %s',
      (field) => {
        const { blockers } = buildStepPlan({
          live: live(),
          snapshot: snapshot({ [field]: '' }),
        });
        expect(blockers).toEqual([
          {
            code: 'MISSING_STEP_FIELD',
            message: `Step field "${field}" is required`,
            section: 'steps',
            entityId: 'step-1',
          },
        ]);
      },
    );

    it('emits an update when stageId changes to another stage', () => {
      const { operations } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ stageId: 'stage-2' }),
      });
      expect(operations).toEqual([
        {
          kind: 'update',
          section: 'steps',
          entityId: 'step-1',
          field: 'stageId',
          before: 'stage-1',
          after: 'stage-2',
        },
      ]);
    });

    it('emits an update when stageId is cleared, and none when null stays null', () => {
      expect(
        buildStepPlan({ live: live(), snapshot: snapshot({ stageId: null }) })
          .operations,
      ).toEqual([
        expect.objectContaining({
          field: 'stageId',
          before: 'stage-1',
          after: null,
        }),
      ]);
      expect(
        buildStepPlan({
          live: live({ stageId: null }),
          snapshot: snapshot({ stageId: null }),
        }).operations,
      ).toEqual([]);
    });
  });

  describe('order', () => {
    it('emits the blocker and no update or move when order changed', () => {
      const { operations, blockers } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ order: 1 }),
      });

      expect(operations).toEqual([]);
      expect(blockers).toEqual([
        {
          code: 'SIBLING_REORDER_NOT_SUPPORTED',
          message:
            'Step order cannot be changed in a step revision (live 2, draft 1)',
          section: 'steps',
          entityId: 'step-1',
        },
      ]);
    });

    it('treats an omitted order as unchanged', () => {
      const { order: _order, ...rest } = snapshot();
      expect(
        buildStepPlan({
          live: live(),
          snapshot: rest as PathwayStepSnapshot,
        }),
      ).toEqual({ operations: [], blockers: [] });
    });
  });

  describe('skills', () => {
    it('links a skill that is new in the snapshot', () => {
      const { operations } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ skillIds: ['skill-a', 'skill-b', 'skill-c'] }),
      });
      expect(operations).toEqual([
        {
          kind: 'link',
          section: 'stepSkills',
          entityId: 'skill-c',
          parentId: 'step-1',
        },
      ]);
    });

    it('unlinks a skill that is gone from the snapshot', () => {
      const { operations } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ skillIds: ['skill-a'] }),
      });
      expect(operations).toEqual([
        {
          kind: 'unlink',
          section: 'stepSkills',
          entityId: 'skill-b',
          parentId: 'step-1',
        },
      ]);
    });

    it('ignores the order of the ids', () => {
      expect(
        buildStepPlan({
          live: live(),
          snapshot: snapshot({ skillIds: ['skill-b', 'skill-a'] }),
        }).operations,
      ).toEqual([]);
    });
  });

  describe('resources', () => {
    it('links a new resource and unlinks a removed one in the same plan', () => {
      const { operations } = buildStepPlan({
        live: live(),
        snapshot: snapshot({ resourceIds: ['res-b'] }),
      });
      expect(operations).toEqual([
        {
          kind: 'link',
          section: 'stepResources',
          entityId: 'res-b',
          parentId: 'step-1',
        },
        {
          kind: 'unlink',
          section: 'stepResources',
          entityId: 'res-a',
          parentId: 'step-1',
        },
      ]);
    });
  });

  it('plans fields and both link-sets together, in that order', () => {
    const { operations } = buildStepPlan({
      live: live(),
      snapshot: snapshot({
        title: 'New',
        skillIds: ['skill-a'],
        resourceIds: ['res-a', 'res-b'],
      }),
    });
    expect(operations.map((op) => `${op.section}:${op.kind}`)).toEqual([
      'steps:update',
      'stepSkills:unlink',
      'stepResources:link',
    ]);
  });
});
