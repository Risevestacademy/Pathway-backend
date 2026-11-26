import { describe, expect, it } from '@jest/globals';
import type { PlanBlocker, PlanOperation } from '../../envelope/strategy.types';
import { planOutlookFields } from './outlook.plan';
import type { LiveOutlookForPlan, OutlookSnapshot } from './outlook.types';

const snapshot = (sourceId: string | null): OutlookSnapshot => ({
  schemaVersion: 1,
  type: 'DEMAND',
  geography: 'Lagos, Nigeria',
  sourceId,
  period: 'Q2 2025',
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
});

const live = (sourceId: string | null): LiveOutlookForPlan => {
  return {
    ...snapshot(sourceId),
    id: 'outlook-1',
    careerId: 'career-1',
    median: null,
    percentile25: null,
    percentile75: null,
    growthPercent: null,
  };
};

const plan = (from: string | null, to: string | null) => {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];
  planOutlookFields(live(from), snapshot(to), operations, blockers);
  return { operations, blockers };
};

describe('planOutlookFields sourceId', () => {
  it('emits an update when a source is set', () => {
    expect(plan(null, 'source-1').operations).toEqual([
      {
        kind: 'update',
        section: 'outlook',
        entityId: 'outlook-1',
        field: 'sourceId',
        before: null,
        after: 'source-1',
      },
    ]);
  });

  it('emits an update when the source is cleared', () => {
    expect(plan('source-1', null).operations).toEqual([
      {
        kind: 'update',
        section: 'outlook',
        entityId: 'outlook-1',
        field: 'sourceId',
        before: 'source-1',
        after: null,
      },
    ]);
  });

  it('emits an update when the source changes', () => {
    expect(plan('source-1', 'source-2').operations).toEqual([
      expect.objectContaining({
        field: 'sourceId',
        before: 'source-1',
        after: 'source-2',
      }),
    ]);
  });

  it('emits nothing when the source is the same', () => {
    expect(plan('source-1', 'source-1')).toEqual({
      operations: [],
      blockers: [],
    });
  });
});
