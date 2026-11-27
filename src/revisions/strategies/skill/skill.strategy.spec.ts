import { describe, expect, it } from '@jest/globals';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { SKILL_FIELD_CONFIG } from './skill.config';
import { SkillRevisionStrategy } from './skill.strategy';
import type { LiveSkillForPlan, SkillSnapshot } from './skill.types';

const baseSnapshot = (): SkillSnapshot => ({
  schemaVersion: 1,
  name: 'Circuit Design',
  description: 'Designing simple circuits.',
});

const liveFromSnapshot = (s: SkillSnapshot): LiveSkillForPlan => ({
  id: 'skill-1',
  name: s.name,
  description: s.description,
});

const skillSeed: ConformanceSeed<SkillSnapshot, LiveSkillForPlan> = {
  contentId: 'skill-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), name: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), description: 'Something else.' },
    changedField: 'description',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.skill.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new SkillRevisionStrategy(),
  seed: skillSeed,
});

const strategy = new SkillRevisionStrategy();
const live = liveFromSnapshot(baseSnapshot());

describe('SkillRevisionStrategy', () => {
  it('edits only name and description, with name required', () => {
    expect(
      SKILL_FIELD_CONFIG.map((e) => [e.field, e.required ?? false]),
    ).toEqual([
      ['name', true],
      ['description', false],
    ]);
  });

  describe('validate', () => {
    it('reports an empty name', () => {
      expect(strategy.validate({ ...baseSnapshot(), name: '' })).toEqual([
        'name: required',
      ]);
    });

    it('reports a non-string name', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          name: 42,
        } as unknown as SkillSnapshot),
      ).toEqual(['name: must be a string']);
    });

    it('accepts a null description', () => {
      expect(
        strategy.validate({ ...baseSnapshot(), description: null }),
      ).toEqual([]);
    });
  });

  describe('plan', () => {
    it('blocks with SKILL_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'SKILL_NOT_FOUND',
            message: 'Skill not found',
            section: 'skills',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_SKILL_FIELD blocker for an empty name', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), name: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_SKILL_FIELD',
          message: 'Skill field "name" is required',
          section: 'skills',
          entityId: 'skill-1',
        },
      ]);
    });

    it('emits updates for a renamed skill and a cleared description', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), name: 'Circuits', description: null },
        0,
      );
      expect(plan.operations).toEqual([
        {
          kind: 'update',
          section: 'skills',
          entityId: 'skill-1',
          field: 'name',
          before: 'Circuit Design',
          after: 'Circuits',
        },
        {
          kind: 'update',
          section: 'skills',
          entityId: 'skill-1',
          field: 'description',
          before: 'Designing simple circuits.',
          after: null,
        },
      ]);
    });
  });

  it('renders changes under the skill name', async () => {
    const snapshot = { ...baseSnapshot(), name: 'Circuits' };
    const sections = await strategy.diff(
      strategy.plan(live, snapshot, 0),
      snapshot,
      {
        revisionId: 'revision-1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 'session-1',
      },
    );
    expect(sections).toEqual([
      {
        section: 'skills',
        contentType: 'SKILL',
        changed: [
          {
            entityId: 'skill-1',
            entityTitle: 'Circuits',
            changes: [
              {
                field: 'name',
                label: 'Name',
                before: 'Circuit Design',
                after: 'Circuits',
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

  describe('titleFor', () => {
    it('reads the name', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('Circuit Design');
    });

    it('falls back to Unknown', () => {
      expect(strategy.titleFor(undefined)).toBe('Unknown');
      expect(strategy.titleFor({ title: 'Not a skill' })).toBe('Unknown');
    });
  });
});
