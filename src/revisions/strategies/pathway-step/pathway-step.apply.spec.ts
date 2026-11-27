import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyStepPlan } from './pathway-step.apply';

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
  section: 'steps',
  entityId: 'step-1',
  field,
  before: 'old',
  after,
});

const link = (
  section: 'stepSkills' | 'stepResources',
  id: string,
): PlanOperation => ({
  kind: 'link',
  section,
  entityId: id,
  parentId: 'step-1',
});

const unlink = (
  section: 'stepSkills' | 'stepResources',
  id: string,
): PlanOperation => ({
  kind: 'unlink',
  section,
  entityId: id,
  parentId: 'step-1',
});

describe('applyStepPlan', () => {
  it('groups every field update into one tx.pathwayStep.update', async () => {
    const t = makeTxMock();

    const result = await applyStepPlan(
      asTx(t),
      plan([
        update('title', 'New title'),
        update('learningObjective', 'New objective'),
        update('stageId', null),
      ]),
      'step-1',
    );

    expect(t.pathwayStep.update).toHaveBeenCalledTimes(1);
    expect(t.pathwayStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: {
        title: 'New title',
        learningObjective: 'New objective',
        stageId: null,
      },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('creates a PathwayStepSkill row for a skill link', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([link('stepSkills', 'skill-c')]),
      'step-1',
    );

    expect(t.pathwayStepSkill.create).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepSkill.create).toHaveBeenCalledWith({
      data: { pathwayStepId: 'step-1', skillId: 'skill-c' },
    });
  });

  it('deletes a PathwayStepSkill row by its composite key for a skill unlink', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([unlink('stepSkills', 'skill-b')]),
      'step-1',
    );

    expect(t.pathwayStepSkill.delete).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepSkill.delete).toHaveBeenCalledWith({
      where: {
        pathwayStepId_skillId: { pathwayStepId: 'step-1', skillId: 'skill-b' },
      },
    });
  });

  it('creates a PathwayStepResource row, with no usageNote, for a resource link', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([link('stepResources', 'res-c')]),
      'step-1',
    );

    expect(t.pathwayStepResource.create).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepResource.create).toHaveBeenCalledWith({
      data: { pathwayStepId: 'step-1', resourceId: 'res-c' },
    });
  });

  it('deletes a PathwayStepResource row by its composite key for a resource unlink', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([unlink('stepResources', 'res-b')]),
      'step-1',
    );

    expect(t.pathwayStepResource.delete).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepResource.delete).toHaveBeenCalledWith({
      where: {
        pathwayStepId_resourceId: {
          pathwayStepId: 'step-1',
          resourceId: 'res-b',
        },
      },
    });
  });

  it('makes one call per link op when two ops hit the same table', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([
        link('stepSkills', 'skill-c'),
        link('stepSkills', 'skill-d'),
        unlink('stepSkills', 'skill-a'),
        unlink('stepResources', 'res-a'),
        link('stepResources', 'res-b'),
      ]),
      'step-1',
    );

    expect(t.pathwayStepSkill.create).toHaveBeenCalledTimes(2);
    expect(t.pathwayStepSkill.create).toHaveBeenNthCalledWith(1, {
      data: { pathwayStepId: 'step-1', skillId: 'skill-c' },
    });
    expect(t.pathwayStepSkill.create).toHaveBeenNthCalledWith(2, {
      data: { pathwayStepId: 'step-1', skillId: 'skill-d' },
    });
    expect(t.pathwayStepSkill.delete).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepResource.create).toHaveBeenCalledTimes(1);
    expect(t.pathwayStepResource.delete).toHaveBeenCalledTimes(1);
    expect(t.pathwayStep.update).not.toHaveBeenCalled();
  });

  it('writes nothing for an empty plan', async () => {
    const t = makeTxMock();

    const result = await applyStepPlan(asTx(t), plan([]), 'step-1');

    expect(t.pathwayStep.update).not.toHaveBeenCalled();
    expect(t.pathwayStepSkill.create).not.toHaveBeenCalled();
    expect(t.pathwayStepSkill.delete).not.toHaveBeenCalled();
    expect(t.pathwayStepResource.create).not.toHaveBeenCalled();
    expect(t.pathwayStepResource.delete).not.toHaveBeenCalled();
    expect(result.createdIds).toEqual(new Map());
  });

  it('never writes order, pathwayId or the step itself', async () => {
    const t = makeTxMock();

    await applyStepPlan(
      asTx(t),
      plan([
        update('order', 5),
        update('pathwayId', 'pathway-9'),
        update('title', 'New title'),
      ]),
      'step-1',
    );

    expect(t.pathwayStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { title: 'New title' },
    });
  });
});
