import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applySkillPlan } from './skill.apply';

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
  section: 'skills',
  entityId: 'skill-1',
  field,
  before: 'old',
  after,
});

describe('applySkillPlan', () => {
  it('groups name and description into one tx.skill.update', async () => {
    const t = makeTxMock();

    const result = await applySkillPlan(
      asTx(t),
      plan([update('name', 'Circuits'), update('description', null)]),
      'skill-1',
    );

    expect(t.skill.update).toHaveBeenCalledTimes(1);
    expect(t.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { name: 'Circuits', description: null },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applySkillPlan(asTx(t), plan([]), 'skill-1');

    expect(t.skill.update).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });
});
