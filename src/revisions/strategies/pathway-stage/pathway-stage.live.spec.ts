import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLivePathwayStage, lockPathwayStage } from './pathway-stage.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('loadLivePathwayStage', () => {
  it('queries the PathwayStage row by id with no include', async () => {
    const t = makeTxMock();
    t.pathwayStage.findUnique.mockResolvedValue({ id: 'stage-1' } as never);

    await loadLivePathwayStage(asTx(t), 'stage-1');

    expect(t.pathwayStage.findUnique).toHaveBeenCalledTimes(1);
    expect(t.pathwayStage.findUnique).toHaveBeenCalledWith({
      where: { id: 'stage-1' },
    });
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.pathwayStage.findUnique.mockResolvedValue(null as never);

    expect(await loadLivePathwayStage(asTx(t), 'stage-1')).toBeNull();
  });
});

describe('lockPathwayStage', () => {
  it('locks the PathwayStage row for update', async () => {
    const t = makeTxMock();

    await lockPathwayStage(asTx(t), 'stage-1');

    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "PathwayStage" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('stage-1');
  });
});
