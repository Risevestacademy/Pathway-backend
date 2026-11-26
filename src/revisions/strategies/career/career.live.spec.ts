import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { loadLiveCareer } from './career.live';

// ─────────────────────────────────────────────────────────────────────
// `loadLiveCareer` reads the Career row and its `skills` relation, and maps
// them into `LiveCareerForPlan`. Post-shrink, the loader does not include
// pathway, steps, resources, or outlook — those are separate content roots
// (README §Aggregate boundaries). Outlook is still in the career aggregate
// per the brief, but the career apply plans it from the snapshot and does
// not re-read live outlook; `LiveCareerForPlan` has no `outlook` field.
//
// These tests assert on the field mapping, not on SQL. The `tx` is a mock.
// ─────────────────────────────────────────────────────────────────────

const tx = (): TxMock => makeTxMock();

const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

/** The subset of the Career row that `loadLiveCareer` selects. */
const careerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'career-1',
  version: 3,
  title: 'Electrician',
  slug: 'electrician',
  description: 'Wires buildings.',
  roleSummary: 'Installs and maintains electrical systems.',
  fieldId: 'field-1',
  targetLevels: ['STUDENT'],
  exampleActivities: ['Wire a house'],
  typicalEducationNote: 'Apprenticeship',
  certificationsNote: null,
  skills: [
    { skillId: 'skill-a', importance: 'REQUIRED' },
    { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
  ],
  ...overrides,
});

describe('loadLiveCareer', () => {
  it('returns null when the career row is missing', async () => {
    const t = tx();
    t.career.findUnique.mockResolvedValue(null);

    const result = await loadLiveCareer(asTx(t), 'career-1');

    expect(result).toBeNull();
  });

  it('maps the Career row and its skills into LiveCareerForPlan', async () => {
    const t = tx();
    t.career.findUnique.mockResolvedValue(careerRow());

    const result = await loadLiveCareer(asTx(t), 'career-1');

    expect(result).toEqual({
      id: 'career-1',
      version: 3,
      title: 'Electrician',
      slug: 'electrician',
      description: 'Wires buildings.',
      roleSummary: 'Installs and maintains electrical systems.',
      fieldId: 'field-1',
      targetLevels: ['STUDENT'],
      exampleActivities: ['Wire a house'],
      typicalEducationNote: 'Apprenticeship',
      certificationsNote: null,
      skills: [
        { skillId: 'skill-a', importance: 'REQUIRED' },
        { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
      ],
    });
  });

  it('returns an empty skills array when the career has no skills', async () => {
    const t = tx();
    t.career.findUnique.mockResolvedValue(careerRow({ skills: [] }));

    const result = await loadLiveCareer(asTx(t), 'career-1');

    expect(result?.skills).toEqual([]);
  });

  it('queries the Career row by id with the skills relation included', async () => {
    const t = tx();
    t.career.findUnique.mockResolvedValue(careerRow());

    await loadLiveCareer(asTx(t), 'career-1');

    expect(t.career.findUnique).toHaveBeenCalledTimes(1);
    expect(t.career.findUnique).toHaveBeenCalledWith({
      where: { id: 'career-1' },
      include: { skills: true },
    });
  });
});
