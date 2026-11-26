import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PlanOperation,
  RevisionPlan,
} from '../../envelope/strategy.types';
import { makeTxMock, type TxMock } from '../../__test__/helpers/mocks';
import { applyCareerPlan } from './career.apply';

// ─────────────────────────────────────────────────────────────────────
// `applyCareerPlan` operates purely off the plan; it does not re-read the
// live shape (the `live` parameter was dropped in Phase A). Every test here
// passes the `makeTxMock()` client and asserts on the calls the apply makes.
//
// Post-shrink, the career apply handles exactly three sections:
//   - 'career'   → one `tx.career.update` per plan (fields grouped)
//   - 'skills'   → `tx.careerSkill.create` / `.update` / `.delete`
//   - 'outlook'  → `tx.outlookData.create` / `.update` / `.delete`
//
// No pathway, step, stepSkill, stepResource, or resource calls: those
// blocks were removed in Phase A. The career strategy creates no rows, so
// `createdIds` is always empty.
// ─────────────────────────────────────────────────────────────────────

const tx = (): TxMock => makeTxMock();

const plan = (operations: PlanOperation[]): RevisionPlan => ({
  operations,
  blockers: [],
  advisories: [],
  stale: false,
});

// The apply's `tx` type is Prisma.TransactionClient; makeTxMock is a
// structural superset for the methods we call. Cast once, here, so the
// per-test code reads cleanly.
const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

describe('applyCareerPlan', () => {
  // ── career fields ─────────────────────────────────────────────────
  it('groups career field updates into one tx.career.update', async () => {
    const t = tx();
    const result = await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'description',
          before: 'Old.',
          after: 'New.',
        },
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'roleSummary',
          before: 'Old summary.',
          after: 'New summary.',
        },
      ]),
      'career-1',
    );

    expect(t.career.update).toHaveBeenCalledTimes(1);
    expect(t.career.update).toHaveBeenCalledWith({
      where: { id: 'career-1' },
      data: { description: 'New.', roleSummary: 'New summary.' },
    });
    expect(result.createdIds.size).toBe(0);
  });

  it('does not call tx.career.update when no career field changed', async () => {
    const t = tx();
    await applyCareerPlan(asTx(t), plan([]), 'career-1');
    expect(t.career.update).not.toHaveBeenCalled();
  });

  // ── career skills ─────────────────────────────────────────────────
  it('creates a CareerSkill row for a link', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'link',
          section: 'skills',
          entityId: 'skill-c',
          after: { skillId: 'skill-c', importance: 'REQUIRED' },
        },
      ]),
      'career-1',
    );

    expect(t.careerSkill.create).toHaveBeenCalledTimes(1);
    expect(t.careerSkill.create).toHaveBeenCalledWith({
      data: {
        careerId: 'career-1',
        skillId: 'skill-c',
        importance: 'REQUIRED',
      },
    });
  });

  it('updates a CareerSkill row for an importance change', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'update',
          section: 'skills',
          entityId: 'skill-b',
          field: 'importance',
          before: 'NICE_TO_HAVE',
          after: 'REQUIRED',
        },
      ]),
      'career-1',
    );

    expect(t.careerSkill.update).toHaveBeenCalledTimes(1);
    expect(t.careerSkill.update).toHaveBeenCalledWith({
      where: {
        careerId_skillId: { careerId: 'career-1', skillId: 'skill-b' },
      },
      data: { importance: 'REQUIRED' },
    });
  });

  it('deletes a CareerSkill row for an unlink', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'unlink',
          section: 'skills',
          entityId: 'skill-b',
          before: { skillId: 'skill-b', importance: 'NICE_TO_HAVE' },
        },
      ]),
      'career-1',
    );

    expect(t.careerSkill.delete).toHaveBeenCalledTimes(1);
    expect(t.careerSkill.delete).toHaveBeenCalledWith({
      where: {
        careerId_skillId: { careerId: 'career-1', skillId: 'skill-b' },
      },
    });
  });

  // ── outlook ───────────────────────────────────────────────────────
  it('creates an OutlookData row for an outlook create', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'create',
          section: 'outlook',
          entityId: 'new-1',
          after: { type: 'REGIONAL', geography: 'UK', median: '30000' },
        },
      ]),
      'career-1',
    );

    expect(t.outlookData.create).toHaveBeenCalledTimes(1);
    expect(t.outlookData.create).toHaveBeenCalledWith({
      data: {
        careerId: 'career-1',
        type: 'REGIONAL',
        geography: 'UK',
        median: '30000',
      },
    });
  });

  it('updates an OutlookData row by entityId', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'update',
          section: 'outlook',
          entityId: 'outlook-1',
          before: { median: '30000' },
          after: { median: '35000' },
        },
      ]),
      'career-1',
    );

    expect(t.outlookData.update).toHaveBeenCalledTimes(1);
    expect(t.outlookData.update).toHaveBeenCalledWith({
      where: { id: 'outlook-1' },
      data: { median: '35000' },
    });
  });

  it('deletes an OutlookData row by entityId', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        {
          kind: 'delete',
          section: 'outlook',
          entityId: 'outlook-1',
          before: { id: 'outlook-1' },
        },
      ]),
      'career-1',
    );

    expect(t.outlookData.delete).toHaveBeenCalledTimes(1);
    expect(t.outlookData.delete).toHaveBeenCalledWith({
      where: { id: 'outlook-1' },
    });
  });

  // ── empty plan ────────────────────────────────────────────────────
  it('makes no calls and returns empty createdIds for an empty plan', async () => {
    const t = tx();
    const result = await applyCareerPlan(asTx(t), plan([]), 'career-1');

    expect(result.createdIds.size).toBe(0);
    expect(t.career.update).not.toHaveBeenCalled();
    expect(t.careerSkill.create).not.toHaveBeenCalled();
    expect(t.careerSkill.update).not.toHaveBeenCalled();
    expect(t.careerSkill.delete).not.toHaveBeenCalled();
    expect(t.outlookData.create).not.toHaveBeenCalled();
    expect(t.outlookData.update).not.toHaveBeenCalled();
    expect(t.outlookData.delete).not.toHaveBeenCalled();
  });

  // ── operation order ───────────────────────────────────────────────
  it('applies career updates, then skill links, then outlook creates (section order)', async () => {
    const t = tx();
    await applyCareerPlan(
      asTx(t),
      plan([
        // Deliberately interleaved in the plan to prove the apply groups by
        // section (not by plan order).
        {
          kind: 'create',
          section: 'outlook',
          entityId: 'new-1',
          after: { type: 'REGIONAL' },
        },
        {
          kind: 'link',
          section: 'skills',
          entityId: 'skill-c',
          after: { skillId: 'skill-c', importance: 'REQUIRED' },
        },
        {
          kind: 'update',
          section: 'career',
          entityId: 'career-1',
          field: 'description',
          before: 'a',
          after: 'b',
        },
      ]),
      'career-1',
    );

    const careerOrder = (
      t.career.update as unknown as { mock: { invocationCallOrder: number[] } }
    ).mock.invocationCallOrder[0];
    const skillOrder = (
      t.careerSkill.create as unknown as {
        mock: { invocationCallOrder: number[] };
      }
    ).mock.invocationCallOrder[0];
    const outlookOrder = (
      t.outlookData.create as unknown as {
        mock: { invocationCallOrder: number[] };
      }
    ).mock.invocationCallOrder[0];

    expect(careerOrder).toBeLessThan(skillOrder);
    expect(skillOrder).toBeLessThan(outlookOrder);
  });
});
