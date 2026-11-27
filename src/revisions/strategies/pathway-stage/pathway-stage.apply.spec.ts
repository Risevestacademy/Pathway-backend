import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyStagePlan } from './pathway-stage.apply';

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
  section: 'stages',
  entityId: 'stage-1',
  field,
  before: 'old',
  after,
});

describe('applyStagePlan', () => {
  it('groups every field update into one tx.pathwayStage.update', async () => {
    const t = makeTxMock();

    const result = await applyStagePlan(
      asTx(t),
      plan([update('title', 'New title'), update('description', null)]),
      'stage-1',
    );

    expect(t.pathwayStage.update).toHaveBeenCalledTimes(1);
    expect(t.pathwayStage.update).toHaveBeenCalledWith({
      where: { id: 'stage-1' },
      data: { title: 'New title', description: null },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applyStagePlan(asTx(t), plan([]), 'stage-1');

    expect(t.pathwayStage.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });

  it('never writes order or pathwayId, even if an operation names them', async () => {
    const t = makeTxMock();

    await applyStagePlan(
      asTx(t),
      plan([
        update('order', 1),
        update('pathwayId', 'pathway-9'),
        update('title', 'New title'),
      ]),
      'stage-1',
    );

    expect(t.pathwayStage.update).toHaveBeenCalledWith({
      where: { id: 'stage-1' },
      data: { title: 'New title' },
    });
  });

  it('makes no write when the only operation names order', async () => {
    const t = makeTxMock();

    await applyStagePlan(asTx(t), plan([update('order', 1)]), 'stage-1');

    expect(t.pathwayStage.update).not.toHaveBeenCalled();
  });
});
