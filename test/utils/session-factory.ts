import { PrismaService } from '../../src/prisma';
import {
  ContentType,
  Prisma,
  RevisionStatus,
} from '../../src/generated/prisma/client';

/**
 * A session + revisions fixture, seeded directly via Prisma.
 *
 * The e2e specs use this to set up the exact state they need to test, then
 * hit the endpoint under test through HTTP. The endpoint is the only thing
 * tested; the fixture is scaffolding.
 *
 * Each fixture gets a unique marker in every text field, so cleanup can find
 * everything by marker (`cleanupByMarker`) — no per-row ID arrays.
 */
export interface SessionFixture {
  marker: string;
  sessionId: string;
  contextType: ContentType;
  contextId: string;
  createdById: string;
  revisionIds: string[];
  careerId: string | null; // present when contextType === 'CAREER' and the root exists
}

export interface SeedSessionOptions {
  /** Unique marker for this fixture; used in every text field for cleanup. */
  marker?: string;

  /** Who created the session. Required. */
  createdById: string;

  /** Content type of the context root. Default 'CAREER'. */
  contextType?: ContentType;

  /**
   * The context root's id.
   * - For CAREER: must be the id of an existing Career row, OR pass `null`
   *   with `createCareer: true` to have one created.
   * - For other types: currently unsupported in T0.4 tests.
   */
  contextId?: string | null;

  /**
   * If true and contextType === 'CAREER' and contextId is null, create a
   * DRAFT Career row (like `createSession` does when `createdCareer: true`).
   */
  createCareer?: boolean;

  /** Session status. Default DRAFT. */
  status?: RevisionStatus;

  /** Whether the session created the DRAFT career. Default matches contextId === null. */
  createdCareer?: boolean;

  /**
   * Revisions to seed. Each gets a ContentRevision row tied to the session.
   * The session's own `contextId` is NOT automatically a revision — pass one
   * explicitly if you want a CAREER revision alongside the session.
   */
  revisions: Array<{
    contentType: ContentType;
    contentId: string;
    snapshot: object;
    baseVersion?: number;
    status?: RevisionStatus;
  }>;

  /** If provided, sets submittedAt. */
  submittedAt?: Date;

  /** If provided, sets publishedAt. */
  publishedAt?: Date;
}

export async function seedSession(
  prisma: PrismaService,
  opts: SeedSessionOptions,
): Promise<SessionFixture> {
  const marker =
    opts.marker ??
    `e2e-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contextType = opts.contextType ?? 'CAREER';

  if (contextType !== 'CAREER') {
    throw new Error(
      `seedSession: T0.4 fixtures only support contextType 'CAREER' (got '${contextType}')`,
    );
  }

  if (opts.contextId === null && !opts.createCareer) {
    throw new Error(
      'seedSession: contextId is null but createCareer is not set; pass contextId or createCareer: true',
    );
  }

  const createdCareer =
    opts.createdCareer ??
    (opts.contextId === null && opts.createCareer === true);

  return prisma.$transaction(async (tx) => {
    // Resolve contextId inside the transaction so a rollback undoes any
    // Career row we created.
    const contextId: string =
      opts.contextId ??
      (
        await tx.career.create({
          data: {
            slug: `e2e-${marker}`,
            title: `Career ${marker}`,
            description: 'seeded',
            exampleActivities: [],
            fieldId: await getOrCreateFieldIdTx(tx, marker),
            status: 'DRAFT',
            version: 1,
          },
        })
      ).id;

    if (opts.contextId !== null && opts.contextId !== undefined) {
      const exists = await tx.career.findUnique({
        where: { id: opts.contextId },
        select: { id: true },
      });
      if (!exists) {
        throw new Error(`seedSession: Career ${opts.contextId} does not exist`);
      }
    }

    const session = await tx.revisionSession.create({
      data: {
        contextType,
        contextId,
        status: opts.status ?? RevisionStatus.DRAFT,
        createdById: opts.createdById,
        createdCareer,
        submittedAt: opts.submittedAt ?? null,
        publishedAt: opts.publishedAt ?? null,
      },
    });

    const revisionIds: string[] = [];
    for (const rev of opts.revisions) {
      const created = await tx.contentRevision.create({
        data: {
          sessionId: session.id,
          contentType: rev.contentType,
          contentId: rev.contentId,
          careerId: contextId,
          baseVersion: rev.baseVersion ?? 0,
          snapshot: rev.snapshot as object,
          status: rev.status ?? RevisionStatus.DRAFT,
          createdById: opts.createdById,
        },
      });
      revisionIds.push(created.id);
    }

    return {
      marker,
      sessionId: session.id,
      contextType,
      contextId,
      createdById: opts.createdById,
      revisionIds,
      careerId: contextId,
    };
  });
}

async function getOrCreateFieldIdTx(
  tx: Prisma.TransactionClient,
  marker: string,
): Promise<string> {
  const existing = await tx.field.findFirst({
    where: { slug: `field-${marker}` },
  });
  if (existing) return existing.id;
  const created = await tx.field.create({
    data: { name: `Field ${marker}`, slug: `field-${marker}` },
  });
  return created.id;
}

/**
 * Delete everything a `seedSession` fixture created, plus its dependents
 * (revisions cascade from the session, publish events do not — we delete
 * them explicitly).
 *
 * Idempotent; safe to call in `afterAll` even if a test already deleted the
 * session.
 */
export async function cleanupSession(
  prisma: PrismaService,
  fixture: SessionFixture,
): Promise<void> {
  if (fixture.revisionIds.length > 0) {
    await prisma.contentRevisionPublishEvent.deleteMany({
      where: { revisionId: { in: fixture.revisionIds } },
    });
  }
  await prisma.revisionSession
    .delete({ where: { id: fixture.sessionId } })
    .catch(() => {});
  if (fixture.careerId) {
    const career = await prisma.career.findUnique({
      where: { id: fixture.careerId },
    });
    if (career?.status === 'DRAFT') {
      await prisma.career
        .delete({ where: { id: fixture.careerId } })
        .catch(() => {});
    }
  }
}

/**
 * Look up a field id by marker, or create one. Tests need *a* Field row for
 * Career.fieldId; the exact row doesn't matter.
 */
async function getOrCreateFieldId(
  prisma: PrismaService,
  marker: string,
): Promise<string> {
  const existing = await prisma.field.findFirst({
    where: { slug: `field-${marker}` },
  });
  if (existing) return existing.id;
  const created = await prisma.field.create({
    data: { name: `Field ${marker}`, slug: `field-${marker}` },
  });
  return created.id;
}
