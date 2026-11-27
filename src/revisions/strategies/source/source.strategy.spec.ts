import { describe, expect, it } from '@jest/globals';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { PUBLISH_ORDER_CREATE } from '../../envelope/publish-order';
import { SOURCE_FIELD_CONFIG } from './source.config';
import { SourceRevisionStrategy } from './source.strategy';
import type { LiveSourceForPlan, SourceSnapshot } from './source.types';

const baseSnapshot = (): SourceSnapshot => ({
  schemaVersion: 1,
  name: 'Bureau of Labor Statistics',
  url: 'https://www.bls.gov',
  lastCheckedAt: '2026-01-01T00:00:00.000Z',
});

const liveFromSnapshot = (s: SourceSnapshot): LiveSourceForPlan => ({
  id: 'source-1',
  name: s.name,
  url: s.url,
  lastCheckedAt: s.lastCheckedAt === null ? null : new Date(s.lastCheckedAt),
});

const sourceSeed: ConformanceSeed<SourceSnapshot, LiveSourceForPlan> = {
  contentId: 'source-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), name: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), url: 'https://example.com' },
    changedField: 'url',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.source.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new SourceRevisionStrategy(),
  seed: sourceSeed,
});

const strategy = new SourceRevisionStrategy();
const live = liveFromSnapshot(baseSnapshot());

describe('SourceRevisionStrategy', () => {
  it('edits name, url and lastCheckedAt, and never verifiedById', () => {
    expect(SOURCE_FIELD_CONFIG.map((e) => e.field)).toEqual([
      'name',
      'url',
      'lastCheckedAt',
    ]);
    expect(Object.keys(baseSnapshot())).not.toContain('verifiedById');
  });

  it('ignores verifiedById when it differs on the live row', () => {
    const plan = strategy.plan(
      { ...live, verifiedById: 'user-1' } as LiveSourceForPlan,
      baseSnapshot(),
      0,
    );
    expect(plan.operations).toEqual([]);
  });

  it('publishes before OUTLOOK', () => {
    expect(PUBLISH_ORDER_CREATE.indexOf('SOURCE')).toBeLessThan(
      PUBLISH_ORDER_CREATE.indexOf('OUTLOOK'),
    );
  });

  describe('validate', () => {
    it('reports an empty name', () => {
      expect(strategy.validate({ ...baseSnapshot(), name: '' })).toEqual([
        'name: required',
      ]);
    });

    it('reports a lastCheckedAt that is not an ISO date-time', () => {
      expect(
        strategy.validate({ ...baseSnapshot(), lastCheckedAt: 'yesterday' }),
      ).toEqual(['lastCheckedAt: must be an ISO 8601 date-time']);
    });

    it('accepts a null url and lastCheckedAt', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          url: null,
          lastCheckedAt: null,
        }),
      ).toEqual([]);
    });
  });

  describe('plan', () => {
    it('blocks with SOURCE_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'SOURCE_NOT_FOUND',
            message: 'Source not found',
            section: 'sources',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_SOURCE_FIELD blocker for an empty name', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), name: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_SOURCE_FIELD',
          message: 'Source field "name" is required',
          section: 'sources',
          entityId: 'source-1',
        },
      ]);
    });

    it('treats the same lastCheckedAt instant as unchanged', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), lastCheckedAt: '2025-12-31T19:00:00-05:00' },
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('emits an update when lastCheckedAt is set from null', () => {
      const plan = strategy.plan(
        { ...live, lastCheckedAt: null },
        baseSnapshot(),
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({
          field: 'lastCheckedAt',
          before: null,
          after: '2026-01-01T00:00:00.000Z',
        }),
      ]);
    });

    it('emits an update when lastCheckedAt is cleared', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), lastCheckedAt: null },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({ field: 'lastCheckedAt', after: null }),
      ]);
    });
  });

  it('renders changes under the source name', async () => {
    const snapshot = { ...baseSnapshot(), name: 'BLS' };
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
        section: 'sources',
        contentType: 'SOURCE',
        changed: [
          {
            entityId: 'source-1',
            entityTitle: 'BLS',
            changes: [
              {
                field: 'name',
                label: 'Name',
                before: 'Bureau of Labor Statistics',
                after: 'BLS',
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

  it('titleFor reads the name and falls back to Unknown', () => {
    expect(strategy.titleFor(baseSnapshot())).toBe(
      'Bureau of Labor Statistics',
    );
    expect(strategy.titleFor(null)).toBe('Unknown');
  });
});
