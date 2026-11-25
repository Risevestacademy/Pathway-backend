import { jest } from '@jest/globals';
import type {
  ContentType,
  RevisionStatus,
} from '../../../generated/prisma/client';

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
