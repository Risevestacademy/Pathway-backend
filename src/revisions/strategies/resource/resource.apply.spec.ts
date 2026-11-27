import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyResourcePlan } from './resource.apply';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

const plan = (operations: PlanOperation[]): RevisionPlan => ({
  operations,
  blockers: [],
  advisories: [],
  stale: false,
});

const update = (field: string, after: unknown): PlanOperation => ({
  kind: 'update',
  section: 'resources',
  entityId: 'resource-1',
  field,
  before: 'old',
  after,
});

describe('applyResourcePlan', () => {
  it('groups every field update into one tx.resource.update', async () => {
    const t = makeTxMock();

    const result = await applyResourcePlan(
      asTx(t),
      plan([
        update('title', 'New title'),
        update('certificationCost', '120.50'),
        update('lastCheckedDate', '2026-02-01T00:00:00.000Z'),
        update('outcomes', ['A', 'B']),
      ]),
      'resource-1',
    );

    expect(t.resource.update).toHaveBeenCalledTimes(1);
    expect(t.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        title: 'New title',
        certificationCost: '120.50',
        lastCheckedDate: '2026-02-01T00:00:00.000Z',
        outcomes: ['A', 'B'],
      },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applyResourcePlan(asTx(t), plan([]), 'resource-1');

    expect(t.resource.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });

  it('writes a cleared optional field as null', async () => {
    const t = makeTxMock();

    await applyResourcePlan(
      asTx(t),
      plan([update('badgeImageUrl', null)]),
      'resource-1',
    );

    expect(t.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: { badgeImageUrl: null },
    });
  });
});
