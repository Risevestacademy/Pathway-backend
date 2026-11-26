import { describe, expect, it } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client';
import { makeTxMock } from '../../__test__/helpers/mocks';
import {
  runStrategyConformanceTests,
  type ConformanceSeed,
} from '../../__test__/helpers/strategy-conformance';
import { OUTLOOK_FIELD_CONFIG } from './outlook.config';
import { OutlookRevisionStrategy } from './outlook.strategy';
import type { LiveOutlookForPlan, OutlookSnapshot } from './outlook.types';

const decimal = (v: string | null) =>
  v === null ? null : new Prisma.Decimal(v);

const baseSnapshot = (): OutlookSnapshot => ({
  schemaVersion: 1,
  type: 'SALARY',
  geography: 'UK',
  sourceId: null,
  period: '2025',
  median: '30000.00',
  percentile25: null,
  percentile75: null,
  currency: 'GBP',
  payPeriod: 'year',
  grossOrNet: 'gross',
  experienceLevel: null,
  baseYear: null,
  baseValue: null,
  projectedYear: null,
  projectedValue: null,
  growthPercent: null,
  demandLevel: null,
});

const liveFromSnapshot = (s: OutlookSnapshot): LiveOutlookForPlan => ({
  id: 'outlook-1',
  careerId: 'career-1',
  type: s.type,
  geography: s.geography,
  sourceId: s.sourceId,
  period: s.period,
  median: decimal(s.median),
  percentile25: decimal(s.percentile25),
  percentile75: decimal(s.percentile75),
  currency: s.currency,
  payPeriod: s.payPeriod,
  grossOrNet: s.grossOrNet,
  experienceLevel: s.experienceLevel,
  baseYear: s.baseYear,
  baseValue: s.baseValue,
  projectedYear: s.projectedYear,
  projectedValue: s.projectedValue,
  growthPercent: decimal(s.growthPercent),
  demandLevel: s.demandLevel,
});

const outlookSeed: ConformanceSeed<OutlookSnapshot, LiveOutlookForPlan> = {
  contentId: 'outlook-1',
  validSnapshot: () => baseSnapshot(),
  invalidSnapshot: () => ({ ...baseSnapshot(), geography: '' }),
  liveMatching: (snapshot) => liveFromSnapshot(snapshot),
  liveWithOneFieldChanged: (snapshot) => ({
    live: { ...liveFromSnapshot(snapshot), median: decimal('35000.00') },
    changedField: 'median',
  }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => {
    t.outlookData.findUnique.mockResolvedValue(live as never);
  },
};

runStrategyConformanceTests({
  strategy: new OutlookRevisionStrategy(),
  seed: outlookSeed,
});

const strategy = new OutlookRevisionStrategy();
const live = liveFromSnapshot(baseSnapshot());

describe('OutlookRevisionStrategy', () => {
  describe('config', () => {
    it('covers every column except id, careerId and timestamps', () => {
      expect(OUTLOOK_FIELD_CONFIG.map((e) => e.field).sort()).toEqual(
        Object.keys(baseSnapshot())
          .filter((k) => k !== 'schemaVersion')
          .sort(),
      );
      const fields = OUTLOOK_FIELD_CONFIG.map((e) => e.field);
      for (const excluded of ['id', 'careerId', 'createdAt', 'updatedAt']) {
        expect(fields).not.toContain(excluded);
      }
    });

    it('requires type, geography and period', () => {
      expect(
        OUTLOOK_FIELD_CONFIG.filter((e) => e.required).map((e) => e.field),
      ).toEqual(['type', 'geography', 'period']);
    });

    it('compares the four Decimal columns as decimals', () => {
      expect(
        OUTLOOK_FIELD_CONFIG.filter((e) => e.kind === 'decimal').map(
          (e) => e.field,
        ),
      ).toEqual(['median', 'percentile25', 'percentile75', 'growthPercent']);
    });
  });

  describe('validate', () => {
    it.each(['type', 'geography', 'period'])('reports an empty %s', (field) => {
      expect(strategy.validate({ ...baseSnapshot(), [field]: '' })).toEqual([
        `${field}: required`,
      ]);
    });

    it('reports values of the wrong type', () => {
      const snapshot = {
        ...baseSnapshot(),
        type: 'WAGES',
        median: 'lots',
        baseYear: 2025.5,
        demandLevel: 'EXTREME',
      } as unknown as OutlookSnapshot;
      expect(strategy.validate(snapshot)).toEqual([
        'type: must be one of SALARY, EMPLOYMENT_GROWTH, DEMAND',
        'median: must be a decimal number',
        'baseYear: must be an integer',
        'demandLevel: must be one of LOW, MEDIUM, HIGH',
      ]);
    });

    it('reports values too large for their columns', () => {
      expect(
        strategy.validate({
          ...baseSnapshot(),
          median: '10000000000000',
          growthPercent: '1000',
          baseValue: 2147483648,
        }),
      ).toEqual([
        'median: must be between -9999999999999.99 and 9999999999999.99',
        'baseValue: must be between -2147483648 and 2147483647',
        'growthPercent: must be between -999.99 and 999.99',
      ]);
    });

    it('does not require fields that belong to another outlook type', () => {
      expect(
        strategy.validate({ ...baseSnapshot(), type: 'DEMAND', median: null }),
      ).toEqual([]);
    });
  });

  describe('plan', () => {
    it('blocks with OUTLOOK_NOT_FOUND when the live row is missing', () => {
      expect(strategy.plan(null, baseSnapshot(), 0)).toEqual({
        operations: [],
        blockers: [
          {
            code: 'OUTLOOK_NOT_FOUND',
            message: 'Outlook not found',
            section: 'outlook',
          },
        ],
        advisories: [],
        stale: false,
      });
    });

    it('emits a MISSING_OUTLOOK_FIELD blocker for an empty geography', () => {
      const plan = strategy.plan(live, { ...baseSnapshot(), geography: '' }, 0);
      expect(plan.blockers).toEqual([
        {
          code: 'MISSING_OUTLOOK_FIELD',
          message: 'Outlook field "geography" is required',
          section: 'outlook',
          entityId: 'outlook-1',
        },
      ]);
    });

    it('treats equal decimals with different trailing zeros as unchanged', () => {
      const plan = strategy.plan(
        { ...live, median: decimal('30000'), growthPercent: decimal('8.5') },
        { ...baseSnapshot(), median: '30000.00', growthPercent: '8.50' },
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('emits an update carrying the snapshot string for a changed decimal', () => {
      const plan = strategy.plan(
        live,
        { ...baseSnapshot(), median: '35000.00' },
        0,
      );
      expect(plan.operations).toEqual([
        expect.objectContaining({
          kind: 'update',
          field: 'median',
          after: '35000.00',
        }),
      ]);
    });

    it("blocks when the row belongs to another career than the session's", () => {
      const plan = strategy.plan(live, baseSnapshot(), 0, {
        careerId: 'career-2',
      });
      expect(plan.blockers).toEqual([
        {
          code: 'OUTLOOK_CAREER_MISMATCH',
          message: 'This outlook row belongs to a different career',
          section: 'outlook',
          entityId: 'outlook-1',
        },
      ]);
    });

    it("does not block when the row belongs to the session's career", () => {
      const plan = strategy.plan(live, baseSnapshot(), 0, {
        careerId: 'career-1',
      });
      expect(plan.blockers).toEqual([]);
    });

    it('compares decimals at the column scale', () => {
      const plan = strategy.plan(
        { ...live, growthPercent: decimal('8.00') },
        { ...baseSnapshot(), growthPercent: '8.004' },
        0,
      );
      expect(plan.operations).toEqual([]);
    });

    it('never emits an operation for careerId', () => {
      const plan = strategy.plan(
        { ...live, careerId: 'career-2' },
        baseSnapshot(),
        0,
      );
      expect(plan.operations).toEqual([]);
    });
  });

  describe('titleFor', () => {
    it('joins type and geography', () => {
      expect(strategy.titleFor(baseSnapshot())).toBe('SALARY — UK');
    });

    it('falls back to geography, then the id, then Unknown', () => {
      expect(strategy.titleFor({ geography: 'UK' })).toBe('UK');
      expect(strategy.titleFor({ id: 'outlook-1' })).toBe('outlook-1');
      expect(strategy.titleFor(undefined)).toBe('Unknown');
    });
  });

  it('renders changes under the outlook title', async () => {
    const snapshot = { ...baseSnapshot(), median: '35000.00' };
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
        section: 'outlook',
        contentType: 'OUTLOOK',
        changed: [
          {
            entityId: 'outlook-1',
            entityTitle: 'SALARY — UK',
            changes: [
              {
                field: 'median',
                label: 'Median',
                before: live.median,
                after: '35000.00',
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

  it('declares no temp-id fields, so sourceId is never rewritten', () => {
    expect(strategy.tempIdFields).toEqual([]);
  });
});
