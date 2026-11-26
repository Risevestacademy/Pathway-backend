import { describe, expect, it } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { RESOURCE_FIELD_CONFIG } from './resource.config';
import { ResourceRevisionStrategy } from './resource.strategy';
import type { LiveResourceForPlan, ResourceSnapshot } from './resource.types';

const baseSnapshot = (): ResourceSnapshot => ({
  schemaVersion: 1,
  title: 'Intro to Wiring',
  description: 'A short course.',
  url: 'https://example.com/wiring',
  type: 'COURSE',
  provider: 'Example Academy',
  costStatus: 'PAID',
  certificationCost: '100.00',
  curationRationale: 'Covers the basics.',
  lastCheckedDate: '2026-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  estimatedWeeks: 4,
  badgeImageUrl: null,
  outcomes: ['Wire a socket', 'Read a circuit diagram'],
});

const liveFromSnapshot = (s: ResourceSnapshot): LiveResourceForPlan => ({
  id: 'resource-1',
  title: s.title,
  description: s.description,
  url: s.url,
  type: s.type,
  provider: s.provider,
  costStatus: s.costStatus,
  certificationCost:
    s.certificationCost === null
      ? null
      : new Prisma.Decimal(s.certificationCost),
  curationRationale: s.curationRationale,
  lastCheckedDate: new Date(s.lastCheckedDate),
  status: s.status,
  estimatedWeeks: s.estimatedWeeks,
  badgeImageUrl: s.badgeImageUrl,
  outcomes: [...s.outcomes],
});

const resourceSeed: ConformanceSeed<ResourceSnapshot, LiveResourceForPlan> = {
  contentId: 'resource-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), title: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), title: 'Changed' },
    changedField: 'title',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.resource.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new ResourceRevisionStrategy(),
  seed: resourceSeed,
});

const strategy = new ResourceRevisionStrategy();
const requiredFields = [
  'title',
  'url',
  'type',
  'provider',
  'curationRationale',
  'lastCheckedDate',
];

describe('ResourceRevisionStrategy', () => {
  describe('config', () => {
    it('marks exactly the required resource columns as required', () => {
      expect(
        RESOURCE_FIELD_CONFIG.filter((e) => e.required).map((e) => e.field),
      ).toEqual(requiredFields);
    });

    it('excludes id and timestamps', () => {
      const fields = RESOURCE_FIELD_CONFIG.map((e) => e.field);
      expect(fields).not.toContain('id');
      expect(fields).not.toContain('createdAt');
      expect(fields).not.toContain('updatedAt');
    });
  });

  describe('validate', () => {
    it.each(requiredFields)('reports an empty %s', (field) => {
      const snapshot = { ...baseSnapshot(), [field]: '' };
      expect(strategy.validate(snapshot)).toEqual([`${field}: required`]);
    });

    it('reports values of the wrong type', () => {
      const snapshot = {
        ...baseSnapshot(),
        type: 'PODCAST',
        costStatus: 'MAYBE',
        certificationCost: 'abc',
        lastCheckedDate: '01/02/2026',
        status: 'GONE',
        estimatedWeeks: '4',
        badgeImageUrl: 7,
        outcomes: ['ok', 3],
      } as unknown as ResourceSnapshot;
      expect(strategy.validate(snapshot)).toEqual([
        'type: must be one of COURSE, CERTIFICATION, ARTICLE, VIDEO, BOOK',
        'costStatus: must be one of FREE, PAID, UNKNOWN',
        'certificationCost: must be a decimal number',
        'lastCheckedDate: must be an ISO 8601 date-time',
        'status: must be one of ACTIVE, WITHDRAWN',
        'estimatedWeeks: must be an integer',
        'badgeImageUrl: must be a string',
        'outcomes: must be a list of strings',
      ]);
    });

    it('rejects a date-only lastCheckedDate', () => {
      expect(
        strategy.validate({ ...baseSnapshot(), lastCheckedDate: '2026-01-01' }),
      ).toEqual(['lastCheckedDate: must be an ISO 8601 date-time']);
    });

    it('accepts empty optional fields', () => {
      const snapshot: ResourceSnapshot = {
        ...baseSnapshot(),
        description: null,
        certificationCost: null,
        estimatedWeeks: null,
        outcomes: [],
      };
      expect(strategy.validate(snapshot)).toEqual([]);
    });
  });

  describe('plan', () => {
    const live = liveFromSnapshot(baseSnapshot());

    it('blocks with RESOURCE_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found',
            section: 'resources',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_RESOURCE_FIELD blocker for an empty required field', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), url: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_RESOURCE_FIELD',
          message: 'Resource field "url" is required',
          section: 'resources',
          entityId: 'resource-1',
        },
      ]);
    });

    it('treats certificationCost with different trailing zeros as equal', () => {
      const plan = strategy.plan(
        { ...live, certificationCost: new Prisma.Decimal('100') },
        { ...baseSnapshot(), certificationCost: '100.00' },
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('emits an update when certificationCost changes value', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), certificationCost: '120.50' },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({
          kind: 'update',
          field: 'certificationCost',
          after: '120.50',
        }),
      ]);
    });

    it('emits an update when certificationCost is cleared', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), certificationCost: null },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({ field: 'certificationCost', after: null }),
      ]);
    });

    it('treats the same instant in another ISO form as an unchanged lastCheckedDate', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), lastCheckedDate: '2026-01-01T01:00:00+01:00' },
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('emits an update when lastCheckedDate changes', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), lastCheckedDate: '2026-02-01T00:00:00.000Z' },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({
          kind: 'update',
          field: 'lastCheckedDate',
          after: '2026-02-01T00:00:00.000Z',
        }),
      ]);
    });

    it('treats reordered outcomes as a change', () => {
      const plan = strategy.plan(
        live,
        {
          ...baseSnapshot(),
          outcomes: ['Read a circuit diagram', 'Wire a socket'],
        },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({ kind: 'update', field: 'outcomes' }),
      ]);
    });

    it('leaves fields the snapshot omits unchanged', () => {
      const {
        outcomes: _outcomes,
        description: _description,
        ...rest
      } = baseSnapshot();
      const plan = strategy.plan(
        { ...live, description: 'Live description.' },
        rest as ResourceSnapshot,
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('compares enum columns as scalars', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), status: 'WITHDRAWN', costStatus: 'FREE' },
        0,
      );
      expect(plan.operations.map((op) => op.field)).toEqual([
        'costStatus',
        'status',
      ]);
    });
  });

  describe('diff', () => {
    it('labels each changed field under the resource title', async () => {
      const live = liveFromSnapshot(baseSnapshot());
      const snapshot = {
        ...baseSnapshot(),
        title: 'Wiring 101',
        url: 'https://example.com/101',
      };
      const plan = strategy.plan(live, snapshot, 0);
      const sections = await strategy.diff(plan, snapshot, {
        revisionId: 'revision-1',
        baseVersion: 0,
        liveVersion: 0,
        sessionId: 'session-1',
      });

      expect(sections).toEqual([
        {
          section: 'resources',
          contentType: 'RESOURCE',
          changed: [
            {
              entityId: 'resource-1',
              entityTitle: 'Wiring 101',
              changes: [
                {
                  field: 'title',
                  label: 'Title',
                  before: 'Intro to Wiring',
                  after: 'Wiring 101',
                },
                {
                  field: 'url',
                  label: 'URL',
                  before: 'https://example.com/wiring',
                  after: 'https://example.com/101',
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
      const sections = await strategy.diff(
        { operations: [], blockers: [], advisories: [], stale: false },
        baseSnapshot(),
        {
          revisionId: 'revision-1',
          baseVersion: 0,
          liveVersion: 0,
          sessionId: 'session-1',
        },
      );
      expect(sections).toEqual([]);
    });
  });

  describe('titleFor', () => {
    it('reads the title', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('Intro to Wiring');
    });

    it('falls back to Unknown', () => {
      expect(strategy.titleFor(null)).toBe('Unknown');
      expect(strategy.titleFor({ title: '' })).toBe('Unknown');
    });
  });

  it('declares no temp-id fields and touches no nested roots', () => {
    expect(strategy.tempIdFields).toEqual([]);
    expect(
      strategy.nestedRootsTouched({
        operations: [],
        blockers: [],
        advisories: [],
        stale: false,
      }),
    ).toEqual([]);
  });
});
