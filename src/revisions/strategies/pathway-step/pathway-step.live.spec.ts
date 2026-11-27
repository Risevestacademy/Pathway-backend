import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLivePathwayStep, lockPathwayStep } from './pathway-step.live';

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

const stepRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'step-1',
  pathwayId: 'pathway-1',
  stageId: 'stage-1',
  title: 'Learn circuits',
  description: null,
  learningObjective: 'Read a circuit diagram',
  prerequisites: null,
  expectedActivity: 'Build a simple circuit',
  order: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  skills: [{ pathwayStepId: 'step-1', skillId: 'skill-a' }],
  resources: [
    { pathwayStepId: 'step-1', resourceId: 'res-a', usageNote: 'Chapter 2' },
  ],
  ...overrides,
});

describe('loadLivePathwayStep', () => {
  it('queries the PathwayStep by id and includes both link relations', async () => {
    const t = makeTxMock();
    t.pathwayStep.findUnique.mockResolvedValue(stepRow() as never);

    await loadLivePathwayStep(asTx(t), 'step-1');

    expect(t.pathwayStep.findUnique).toHaveBeenCalledTimes(1);
    expect(t.pathwayStep.findUnique).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      include: { skills: true, resources: true },
    });
  });

  it('maps the row and reduces each link to its id', async () => {
    const t = makeTxMock();
    t.pathwayStep.findUnique.mockResolvedValue(stepRow() as never);

    expect(await loadLivePathwayStep(asTx(t), 'step-1')).toEqual({
      id: 'step-1',
      stageId: 'stage-1',
      title: 'Learn circuits',
      description: null,
      learningObjective: 'Read a circuit diagram',
      prerequisites: null,
      expectedActivity: 'Build a simple circuit',
      order: 2,
      skills: [{ skillId: 'skill-a' }],
      resources: [{ resourceId: 'res-a' }],
    });
  });

  it('returns empty link lists when the step has none', async () => {
    const t = makeTxMock();
    t.pathwayStep.findUnique.mockResolvedValue(
      stepRow({ skills: [], resources: [] }) as never,
    );

    const live = await loadLivePathwayStep(asTx(t), 'step-1');

    expect(live?.skills).toEqual([]);
    expect(live?.resources).toEqual([]);
  });

  it('returns null when the row is missing', async () => {
    const t = makeTxMock();
    t.pathwayStep.findUnique.mockResolvedValue(null as never);

    expect(await loadLivePathwayStep(asTx(t), 'step-1')).toBeNull();
  });
});

describe('lockPathwayStep', () => {
  it('locks the PathwayStep row for update', async () => {
    const t = makeTxMock();

    await lockPathwayStep(asTx(t), 'step-1');

    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, id] = t.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toBe(
      'SELECT 1 FROM "PathwayStep" WHERE "id" = ? FOR UPDATE',
    );
    expect(id).toBe('step-1');
  });
});
