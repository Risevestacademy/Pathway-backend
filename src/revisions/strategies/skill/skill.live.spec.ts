import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLiveSkill, lockSkill } from './skill.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('loadLiveSkill', () => {
  it('queries the Skill row by id with no include', async () => {
    const t = makeTxMock();
    t.skill.findUnique.mockResolvedValue({ id: 'skill-1' } as never);

    await loadLiveSkill(asTx(t), 'skill-1');

    expect(t.skill.findUnique).toHaveBeenCalledTimes(1);
    expect(t.skill.findUnique).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
    });
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.skill.findUnique.mockResolvedValue(null as never);

    expect(await loadLiveSkill(asTx(t), 'skill-1')).toBeNull();
  });
});

describe('lockSkill', () => {
  it('locks the Skill row for update', async () => {
    const t = makeTxMock();

    await lockSkill(asTx(t), 'skill-1');

    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "Skill" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('skill-1');
  });
});
