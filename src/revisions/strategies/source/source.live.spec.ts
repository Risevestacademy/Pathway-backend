import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLiveSource, lockSource } from './source.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('loadLiveSource', () => {
  it('queries the Source row by id with no include', async () => {
    const t = makeTxMock();
    t.source.findUnique.mockResolvedValue({ id: 'source-1' } as never);

    await loadLiveSource(asTx(t), 'source-1');

    expect(t.source.findUnique).toHaveBeenCalledTimes(1);
    expect(t.source.findUnique).toHaveBeenCalledWith({
      where: { id: 'source-1' },
    });
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.source.findUnique.mockResolvedValue(null as never);

    expect(await loadLiveSource(asTx(t), 'source-1')).toBeNull();
  });
});

describe('lockSource', () => {
  it('locks the Source row for update', async () => {
    const t = makeTxMock();

    await lockSource(asTx(t), 'source-1');

    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "Source" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('source-1');
  });
});
