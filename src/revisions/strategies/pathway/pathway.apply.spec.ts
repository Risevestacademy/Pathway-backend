import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyPathwayPlan } from './pathway.apply';

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
  section: 'pathway',
  entityId: 'pathway-1',
  field,
  before: 'old',
  after,
});

describe('applyPathwayPlan', () => {
  it('groups every field update into one tx.pathway.update', async () => {
    const t = makeTxMock();

    const result = await applyPathwayPlan(
      asTx(t),
      plan([update('title', 'New title'), update('description', null)]),
      'pathway-1',
    );

    expect(t.pathway.update).toHaveBeenCalledTimes(1);
    expect(t.pathway.update).toHaveBeenCalledWith({
      where: { id: 'pathway-1' },
      data: { title: 'New title', description: null },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applyPathwayPlan(asTx(t), plan([]), 'pathway-1');

    expect(t.pathway.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });

  it('never writes careerId, even if an operation names it', async () => {
    const t = makeTxMock();

    await applyPathwayPlan(
      asTx(t),
      plan([update('careerId', 'career-9'), update('title', 'New title')]),
      'pathway-1',
    );

    expect(t.pathway.update).toHaveBeenCalledWith({
      where: { id: 'pathway-1' },
      data: { title: 'New title' },
    });
  });

  it('makes no write when the only operation names careerId', async () => {
    const t = makeTxMock();

    await applyPathwayPlan(
      asTx(t),
      plan([update('careerId', 'career-9')]),
      'pathway-1',
    );

    expect(t.pathway.update).not.toHaveBeenCalled();
  });

  it('ignores operations from other sections', async () => {
    const t = makeTxMock();

    await applyPathwayPlan(
      asTx(t),
      plan([{ ...update('title', 'Other'), section: 'stages' }]),
      'pathway-1',
    );

    expect(t.pathway.update).not.toHaveBeenCalled();
  });
});
