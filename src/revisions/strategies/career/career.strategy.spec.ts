import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { CareerRevisionStrategy } from './career.strategy';
import type { CareerSnapshot, LiveCareerForPlan } from './career.types';

// ─────────────────────────────────────────────────────────────────────
// The career strategy is the reference implementation. It runs the full
// conformance suite (the contract every strategy MUST satisfy), plus the
// career-specific assertions the suite deliberately leaves out:
//
//   - `titleFor` reads `snapshot.career.title`.
//   - `plan` throws when `live` is null (the strategy's explicit guard —
//     the session service must create the career first).
//   - `nestedRootsTouched` returns `[]` (career owns exactly one root).
//   - `tempIdFields` is `[]` (career creates no rows).
//   - `diff` renders a skill-importance change as a `changed` entry in
//     the `skills` section.
//   - `fieldLabels` covers every field in `CAREER_FIELD_CONFIG`.
//
// The `apply` and `loadLive` bodies are covered by `career.apply.spec.ts`
// and `career.live.spec.ts`; this file wires the strategy around them.
// ─────────────────────────────────────────────────────────────────────

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

// ── Seed ─────────────────────────────────────────────────────────────

const baseSnapshot = (): CareerSnapshot => ({
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

const liveFromSnapshot = (s: CareerSnapshot): LiveCareerForPlan => ({
  id: 'career-1',
  version: 3,
  ...s.career,
  targetLevels: [...s.career.targetLevels],
  exampleActivities: [...s.career.exampleActivities],
  skills: s.skills.map((sk) => ({
    skillId: sk.skillId,
    importance: sk.importance,
  })),
});

const careerSeed: ConformanceSeed<CareerSnapshot, LiveCareerForPlan> = {
  contentId: 'career-1',

  validSnapshot: () => baseSnapshot(),

  invalidSnapshot: () => {
    // Two duplicate skillIds — `findSnapshotProblems` flags this via
    // `duplicates`. (Required-field checks live in `plan`, not
    // `validate`, per the consistency module's comment.)
    const s = baseSnapshot();
    s.skills = [
      { skillId: 'skill-a', importance: 'REQUIRED' },
      { skillId: 'skill-a', importance: 'NICE_TO_HAVE' },
    ];
    return s;
  },

  liveMatching: (snapshot) => liveFromSnapshot(snapshot),

  liveWithOneFieldChanged: (snapshot) => {
    const live = liveFromSnapshot(snapshot);
    live.description = 'Different description.'; // config compares `description`
    return { live, changedField: 'description' };
  },

  makeTx: () => makeTxMock(),

  seedLive: (t, live) => {
    t.career.findUnique.mockResolvedValue(live);
  },
};

// ── Conformance suite ────────────────────────────────────────────────

runStrategyConformanceTests({
  strategy: new CareerRevisionStrategy(),
  seed: careerSeed,
});

// ── Career-specific assertions ───────────────────────────────────────

const strategy = new CareerRevisionStrategy();

describe('CareerRevisionStrategy (career-specific)', () => {
  describe('titleFor', () => {
    it('reads `career.title` from a snapshot-shaped entity', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('Electrician');
    });

    it('falls back to `title` on an entity-shaped snapshot', () => {
      expect(strategy.titleFor({ title: 'Plumber' })).toBe('Plumber');
    });

    it('returns "Unknown" for a non-object', () => {
      expect(strategy.titleFor(null)).toBe('Unknown');
      expect(strategy.titleFor('nope')).toBe('Unknown');
    });
  });

  describe('plan', () => {
    it('throws when live is null (the session service must create the career first)', () => {
      expect(() => strategy.plan(null, baseSnapshot(), 0)).toThrow(
        /live career is null/,
      );
    });

    it('marks stale when baseVersion < live.version', () => {
      const snapshot = baseSnapshot();
      const live = liveFromSnapshot(snapshot); // version 3
      expect(strategy.plan(live, snapshot, 2).stale).toBe(true);
      expect(strategy.plan(live, snapshot, 3).stale).toBe(false);
    });

    it('emits a NO_SKILLS blocker when the snapshot has no skills', () => {
      const snapshot = baseSnapshot();
      snapshot.skills = [];
      const live = liveFromSnapshot(baseSnapshot());
      const plan = strategy.plan(live, snapshot, 0);
      expect(plan.blockers).toContainEqual(
        expect.objectContaining({ code: 'NO_SKILLS', section: 'skills' }),
      );
    });

    it('emits a MISSING_CAREER_FIELD blocker when a required field is empty', () => {
      const snapshot = baseSnapshot();
      snapshot.career.title = '';
      const live = liveFromSnapshot(baseSnapshot());
      const plan = strategy.plan(live, snapshot, 0);
      expect(plan.blockers).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_CAREER_FIELD',
          section: 'career',
        }),
      );
    });
  });

  describe('nestedRootsTouched', () => {
    it('returns [] (career owns exactly one root)', () => {
      const snapshot = baseSnapshot();
      const live = liveFromSnapshot(snapshot);
      const plan = strategy.plan(live, snapshot, 0);
      expect(strategy.nestedRootsTouched(plan)).toEqual([]);
    });
  });

  describe('tempIdFields', () => {
    it('is empty (career creates no rows)', () => {
      expect(strategy.tempIdFields).toEqual([]);
    });
  });

  describe('diff', () => {
    it('renders a skill-importance change as a `changed` entry in `skills`', async () => {
      const snapshot = baseSnapshot();
      const live = liveFromSnapshot(snapshot);
      live.skills = [{ skillId: 'skill-a', importance: 'NICE_TO_HAVE' }]; // changed importance, removed skill-b
      const plan = strategy.plan(live, snapshot, 0);

      const sections = await strategy.diff(plan, snapshot, {
        revisionId: 'r1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 's1',
      });

      const skillsSection = sections.find((s) => s.section === 'skills');
      expect(skillsSection).toBeDefined();
      expect(skillsSection!.changed).toContainEqual(
        expect.objectContaining({
          entityId: 'skill-a',
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: 'importance',
              before: 'NICE_TO_HAVE',
              after: 'REQUIRED',
            }),
          ]),
        }),
      );
    });

    it('renders a career-field change as a `changed` entry in `career`', async () => {
      const snapshot = baseSnapshot();
      const live = liveFromSnapshot(snapshot);
      live.description = 'Old.';
      const plan = strategy.plan(live, snapshot, 0);

      const sections = await strategy.diff(plan, snapshot, {
        revisionId: 'r1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 's1',
      });

      const careerSection = sections.find((s) => s.section === 'career');
      expect(careerSection).toBeDefined();
      expect(careerSection!.changed[0].changes).toContainEqual(
        expect.objectContaining({
          field: 'description',
          before: 'Old.',
          after: 'Wires buildings.',
        }),
      );
    });
  });

  describe('fieldLabels', () => {
    it('covers every field in CAREER_FIELD_CONFIG', async () => {
      const { CAREER_FIELD_CONFIG } = await import('./career.config');
      for (const entry of CAREER_FIELD_CONFIG) {
        expect(strategy.fieldLabels[entry.field]).toBe(entry.label);
      }
    });
  });
});
