import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyOutlookPlan } from './outlook.apply';

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
  section: 'outlook',
  entityId: 'outlook-1',
  field,
  before: null,
  after,
});

describe('applyOutlookPlan', () => {
  it('writes the decimal strings the snapshot carried in one update', async () => {
    const t = makeTxMock();

    const result = await applyOutlookPlan(
      asTx(t),
      plan([
        update('median', '35000.00'),
        update('growthPercent', '8.50'),
        update('sourceId', 'source-1'),
      ]),
      'outlook-1',
    );

    expect(t.outlookData.update).toHaveBeenCalledTimes(1);
    expect(t.outlookData.update).toHaveBeenCalledWith({
      where: { id: 'outlook-1' },
      data: {
        median: '35000.00',
        growthPercent: '8.50',
        sourceId: 'source-1',
      },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('never creates or deletes outlook rows', async () => {
    const t = makeTxMock();

    await applyOutlookPlan(
      asTx(t),
      plan([
        { kind: 'create', section: 'outlook', entityId: 'new-1', after: {} },
        { kind: 'delete', section: 'outlook', entityId: 'outlook-1' },
      ]),
      'outlook-1',
    );

    expect(t.outlookData.create).not.toHaveBeenCalled();
    expect(t.outlookData.delete).not.toHaveBeenCalled();
    expect(t.outlookData.update).not.toHaveBeenCalled();
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applyOutlookPlan(asTx(t), plan([]), 'outlook-1');

    expect(t.outlookData.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });
});
