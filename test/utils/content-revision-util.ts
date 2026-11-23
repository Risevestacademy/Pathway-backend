import { type PrismaService } from '../../src/prisma';
import {
  ContentType,
  RevisionStatus,
  Prisma,
} from '../../src/generated/prisma/client';

/**
 * Create a ContentRevision row for tests.
 *
 * After T0.2, `contentType` and `contentId` are required. Every test that
 * creates a revision should go through this factory so the schema change is
 * handled in one place, not in every test.
 *
 * For a career revision, `careerId` is both the FK and the `contentId`; the
 * `contentType` is `'CAREER'`. Future content types pass `contentType` and
 * `contentId` explicitly.
 */
export interface SeedRevisionArgs {
  prisma: PrismaService;
  careerId: string;
  createdById: string;
  baseVersion?: number;
  snapshot?: Prisma.InputJsonValue;
  status?: RevisionStatus;
  contentType?: ContentType;
  contentId?: string;
}

export async function seedRevision(args: SeedRevisionArgs) {
  const {
    prisma,
    careerId,
    createdById,
    baseVersion = 1,
    snapshot = { schemaVersion: 1 },
    status = 'DRAFT',
    contentType = 'CAREER',
    contentId = careerId,
  } = args;

  return prisma.contentRevision.create({
    data: {
      careerId,
      contentType,
      contentId,
      baseVersion,
      snapshot,
      status,
      createdById,
    },
  });
}
