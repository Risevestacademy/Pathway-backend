import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLiveOutlook, lockOutlook } from './outlook.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('loadLiveOutlook', () => {
  it('queries the OutlookData row by id with no include', async () => {
    const t = makeTxMock();
    t.outlookData.findUnique.mockResolvedValue({ id: 'outlook-1' } as never);

    await loadLiveOutlook(asTx(t), 'outlook-1');

    expect(t.outlookData.findUnique).toHaveBeenCalledTimes(1);
    expect(t.outlookData.findUnique).toHaveBeenCalledWith({
      where: { id: 'outlook-1' },
    });
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.outlookData.findUnique.mockResolvedValue(null as never);

    expect(await loadLiveOutlook(asTx(t), 'outlook-1')).toBeNull();
  });
});

describe('lockOutlook', () => {
  it('locks the OutlookData row for update', async () => {
    const t = makeTxMock();

    await lockOutlook(asTx(t), 'outlook-1');

    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "OutlookData" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('outlook-1');
  });
});
