import { jest } from '@jest/globals';
import type {
  ContentType,
  RevisionStatus,
} from '../../../generated/prisma/client';

// src/revisions/__test__/helpers/mocks.ts
//
// Only `makeTxMock` is shown here; the rest of the file is unchanged.
// The diff is: add `careerSkill` and `outlookData` groups inside the object
// returned by `makeTxMock`, between the existing `career` group and `review`.

export const makeTxMock = () => ({
  $queryRaw: jest.fn(),
  revisionSession: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contentRevision: {
    findMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  contentRevisionPublishEvent: {
    create: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  career: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  // ── Added in T0.5 / Phase B ─────────────────────────────────────────
  // The career strategy's apply writes CareerSkill rows (link/update/
  // unlink) and OutlookData rows (create/update/delete). Both groups are
  // additive; no existing spec referenced them, so this is a no-op for
  // existing tests.
  careerSkill: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  outlookData: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  resource: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  skill: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  source: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  pathway: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  pathwayStage: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  // ────────────────────────────────────────────────────────────────────
  review: { create: jest.fn() },
});

export type TxMock = ReturnType<typeof makeTxMock>;

export const makePrismaMock = (txMock: TxMock) => ({
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
  revisionSession: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
  },
  contentRevision: {
    findMany: jest.fn(),
  },
  career: {
    findUnique: jest.fn(),
  },
});

export type PrismaMock = ReturnType<typeof makePrismaMock>;

/** A full session row for the SESSION_SELECT shape. */
export const sessionRow = (
  overrides: Partial<{
    id: string;
    contextType: ContentType;
    contextId: string;
    status: RevisionStatus;
    createdById: string;
    createdCareer: boolean;
  }> = {},
) => ({
  id: overrides.id ?? 'session-1',
  contextType: overrides.contextType ?? ('CAREER' as ContentType),
  contextId: overrides.contextId ?? 'career-1',
  status: overrides.status ?? ('DRAFT' as RevisionStatus),
  createdById: overrides.createdById ?? 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  submittedAt: null as Date | null,
  publishedAt: null as Date | null,
  createdCareer: overrides.createdCareer ?? false,
  revisions: [] as Array<{
    id: string;
    contentType: ContentType;
    contentId: string;
    status: RevisionStatus;
    baseVersion: number;
    updatedAt: Date;
  }>,
});
