import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLivePathway, lockPathway } from './pathway.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('loadLivePathway', () => {
  it('queries the Pathway row by id with no include', async () => {
    const t = makeTxMock();
    t.pathway.findUnique.mockResolvedValue({ id: 'pathway-1' } as never);

    await loadLivePathway(asTx(t), 'pathway-1');

    expect(t.pathway.findUnique).toHaveBeenCalledTimes(1);
    expect(t.pathway.findUnique).toHaveBeenCalledWith({
      where: { id: 'pathway-1' },
    });
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.pathway.findUnique.mockResolvedValue(null as never);

    expect(await loadLivePathway(asTx(t), 'pathway-1')).toBeNull();
  });
});

describe('lockPathway', () => {
  it('locks the Pathway row for update', async () => {
    const t = makeTxMock();

    await lockPathway(asTx(t), 'pathway-1');

    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "Pathway" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('pathway-1');
  });
});
