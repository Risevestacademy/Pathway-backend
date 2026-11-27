import { describe, expect, it } from '@jest/globals';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { PATHWAY_STAGE_FIELD_CONFIG } from './pathway-stage.config';
import { PathwayStageRevisionStrategy } from './pathway-stage.strategy';
import type {
  LivePathwayStageForPlan,
  PathwayStageSnapshot,
} from './pathway-stage.types';

const baseSnapshot = (): PathwayStageSnapshot => ({
  schemaVersion: 1,
  title: 'Foundations',
  description: 'Learn the basics.',
  order: 2,
});

const liveFromSnapshot = (
  s: PathwayStageSnapshot,
): LivePathwayStageForPlan => ({
  id: 'stage-1',
  pathwayId: 'pathway-1',
  title: s.title,
  description: s.description,
  order: s.order,
});

const stageSeed: ConformanceSeed<
  PathwayStageSnapshot,
  LivePathwayStageForPlan
> = {
  contentId: 'stage-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), title: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), title: 'Changed' },
    changedField: 'title',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.pathwayStage.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new PathwayStageRevisionStrategy(),
  seed: stageSeed,
});

const strategy = new PathwayStageRevisionStrategy();
const emptyPlan = {
  operations: [],
  blockers: [],
  advisories: [],
  stale: false,
};

describe('PathwayStageRevisionStrategy', () => {
  describe('config', () => {
    it('has only title and description, with title required', () => {
      expect(PATHWAY_STAGE_FIELD_CONFIG.map((e) => e.field)).toEqual([
        'title',
        'description',
      ]);
      expect(
        PATHWAY_STAGE_FIELD_CONFIG.filter((e) => e.required).map(
          (e) => e.field,
        ),
      ).toEqual(['title']);
    });

    it('leaves out order and pathwayId', () => {
      const fields = PATHWAY_STAGE_FIELD_CONFIG.map((e) => e.field);
      expect(fields).not.toContain('order');
      expect(fields).not.toContain('pathwayId');
    });
  });

  describe('validate', () => {
    it('reports an empty title', () => {
      expect(strategy.validate({ ...baseSnapshot(), title: '' })).toEqual([
        'title: required',
      ]);
    });

    it('accepts a null description', () => {
      expect(
        strategy.validate({ ...baseSnapshot(), description: null }),
      ).toEqual([]);
    });
  });

  describe('plan', () => {
    const live = liveFromSnapshot(baseSnapshot());

    it('blocks with PATHWAY_STAGE_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_STAGE_NOT_FOUND',
            message: 'Pathway stage not found',
            section: 'stages',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_STAGE_FIELD blocker for an empty title', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), title: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_STAGE_FIELD',
          message: 'Stage field "title" is required',
          section: 'stages',
          entityId: 'stage-1',
        },
      ]);
    });

    it('emits one update per changed field', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), title: 'New', description: null },
        0,
      );
      expect(plan.operations.map((op) => op.field)).toEqual([
        'title',
        'description',
      ]);
      expect(plan.blockers).toEqual([]);
    });

    it('emits nothing when the live row matches', () => {
      expect(strategy.plan(live, baseSnapshot(), 0)).toEqual(emptyPlan);
    });

    it('emits the blocker and no update when order changed', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), order: 1 }, 0);

      expect(plan.operations).toEqual([]);
      expect(plan.blockers).toEqual([
        {
          code: 'SIBLING_REORDER_NOT_SUPPORTED',
          message:
            'Stage order cannot be changed in a stage revision (live 2, draft 1)',
          section: 'stages',
          entityId: 'stage-1',
        },
      ]);
    });

    it('still plans a title change alongside the order blocker, and never a move', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), title: 'New', order: 3 },
        0,
      );

      expect(plan.operations.map((op) => [op.kind, op.field])).toEqual([
        ['update', 'title'],
      ]);
      expect(plan.blockers.map((b) => b.code)).toEqual([
        'SIBLING_REORDER_NOT_SUPPORTED',
      ]);
    });

    it('treats an omitted order as unchanged', () => {
      const { order: _order, ...rest } = baseSnapshot();
      const plan = strategy.plan(live, rest as PathwayStageSnapshot, 0);
      expect(plan).toEqual(emptyPlan);
    });
  });

  describe('diff', () => {
    it('labels each changed field under the stage title', async () => {
      const live = liveFromSnapshot(baseSnapshot());
      const snapshot = { ...baseSnapshot(), title: 'Core Skills' };
      const plan = strategy.plan(live, snapshot, 0);

      const sections = await strategy.diff(plan, snapshot, {
        revisionId: 'revision-1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 'session-1',
      });

      expect(sections).toEqual([
        {
          section: 'stages',
          contentType: 'PATHWAY_STAGE',
          changed: [
            {
              entityId: 'stage-1',
              entityTitle: 'Core Skills',
              changes: [
                {
                  field: 'title',
                  label: 'Title',
                  before: 'Foundations',
                  after: 'Core Skills',
                },
              ],
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
      ]);
    });

    it('returns no sections for an empty plan', async () => {
      const sections = await strategy.diff(emptyPlan, baseSnapshot(), {
        revisionId: 'revision-1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 'session-1',
      });
      expect(sections).toEqual([]);
    });
  });

  describe('titleFor', () => {
    it('reads the title', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('Foundations');
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
