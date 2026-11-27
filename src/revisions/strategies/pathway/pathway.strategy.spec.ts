import { describe, expect, it } from '@jest/globals';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { PATHWAY_FIELD_CONFIG } from './pathway.config';
import { PathwayRevisionStrategy } from './pathway.strategy';
import type { LivePathwayForPlan, PathwaySnapshot } from './pathway.types';

const baseSnapshot = (): PathwaySnapshot => ({
  schemaVersion: 1,
  title: 'Become an Electrician',
  description: 'From apprentice to qualified.',
});

const liveFromSnapshot = (s: PathwaySnapshot): LivePathwayForPlan => ({
  id: 'pathway-1',
  careerId: 'career-1',
  title: s.title,
  description: s.description,
});

const pathwaySeed: ConformanceSeed<PathwaySnapshot, LivePathwayForPlan> = {
  contentId: 'pathway-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), title: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), title: 'Changed' },
    changedField: 'title',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.pathway.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new PathwayRevisionStrategy(),
  seed: pathwaySeed,
});

const strategy = new PathwayRevisionStrategy();
const emptyPlan = {
  operations: [],
  blockers: [],
  advisories: [],
  stale: false,
};

describe('PathwayRevisionStrategy', () => {
  describe('config', () => {
    it('has only title and description, with title required', () => {
      expect(PATHWAY_FIELD_CONFIG.map((e) => e.field)).toEqual([
        'title',
        'description',
      ]);
      expect(
        PATHWAY_FIELD_CONFIG.filter((e) => e.required).map((e) => e.field),
      ).toEqual(['title']);
    });

    it('leaves out careerId, stages and steps', () => {
      const fields = PATHWAY_FIELD_CONFIG.map((e) => e.field);
      expect(fields).not.toContain('careerId');
      expect(fields).not.toContain('stages');
      expect(fields).not.toContain('steps');
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

    it('blocks with PATHWAY_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'PATHWAY_NOT_FOUND',
            message: 'Pathway not found',
            section: 'pathway',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_PATHWAY_FIELD blocker for an empty title', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), title: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_PATHWAY_FIELD',
          message: 'Pathway field "title" is required',
          section: 'pathway',
          entityId: 'pathway-1',
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
      expect(strategy.plan(live, baseSnapshot(), 0).operations).toEqual([]);
    });

    it('raises no blocker when the live career matches the session career', () => {
      const plan = strategy.plan(live, baseSnapshot(), 0, {
        careerId: 'career-1',
      });
      expect(plan.blockers).toEqual([]);
    });

    it('blocks when the live pathway belongs to another career', () => {
      const plan = strategy.plan(live, baseSnapshot(), 0, {
        careerId: 'career-2',
      });
      expect(plan.blockers).toEqual([
        expect.objectContaining({
          code: 'PATHWAY_CAREER_MISMATCH',
          section: 'pathway',
          entityId: 'pathway-1',
        }),
      ]);
      expect(plan.operations).toEqual([]);
    });

    it('never plans a careerId change, even if the snapshot carries one', () => {
      const snapshot = {
        ...baseSnapshot(),
        careerId: 'career-9',
      } as unknown as PathwaySnapshot;
      expect(strategy.plan(live, snapshot, 0).operations).toEqual([]);
    });
  });

  describe('diff', () => {
    it('labels each changed field under the pathway title', async () => {
      const live = liveFromSnapshot(baseSnapshot());
      const snapshot = { ...baseSnapshot(), title: 'Electrician Path' };
      const plan = strategy.plan(live, snapshot, 0);

      const sections = await strategy.diff(plan, snapshot, {
        revisionId: 'revision-1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 'session-1',
      });

      expect(sections).toEqual([
        {
          section: 'pathway',
          contentType: 'PATHWAY',
          changed: [
            {
              entityId: 'pathway-1',
              entityTitle: 'Electrician Path',
              changes: [
                {
                  field: 'title',
                  label: 'Title',
                  before: 'Become an Electrician',
                  after: 'Electrician Path',
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
      expect(strategy.titleFor(baseSnapshot())).toBe('Become an Electrician');
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
