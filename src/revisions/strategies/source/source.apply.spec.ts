import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applySourcePlan } from './source.apply';

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
  section: 'sources',
  entityId: 'source-1',
  field,
  before: 'old',
  after,
});

describe('applySourcePlan', () => {
  it('groups field updates into one tx.source.update', async () => {
    const t = makeTxMock();

    const result = await applySourcePlan(
      asTx(t),
      plan([
        update('name', 'BLS'),
        update('url', null),
        update('lastCheckedAt', '2026-02-01T00:00:00.000Z'),
      ]),
      'source-1',
    );

    expect(t.source.update).toHaveBeenCalledTimes(1);
    expect(t.source.update).toHaveBeenCalledWith({
      where: { id: 'source-1' },
      data: {
        name: 'BLS',
        url: null,
        lastCheckedAt: '2026-02-01T00:00:00.000Z',
      },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applySourcePlan(asTx(t), plan([]), 'source-1');

    expect(t.source.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });
});
