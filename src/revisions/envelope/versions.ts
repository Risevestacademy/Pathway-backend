import type { Prisma, ContentType } from '../../generated/prisma/client';

/**
 * The current version of a content root.
 *
 * Versioning is the publish-event count (ADR-3). PUBLISHED revisions are
 * never deleted, so the count is monotonic per root. A revision is stale when
 * its `baseVersion` is less than this value.
 *
 * Every caller is inside a transaction (saveDraft doesn't need it; submit,
 * publish, and rebase do), so the signature is narrowed to
 * `Prisma.TransactionClient`. Passing the raw `PrismaService` would invite the
 * "forgot the tx" bug the envelope is designed to prevent.
 */
export async function currentVersion(
  client: Prisma.TransactionClient,
  contentType: ContentType,
  contentId: string,
): Promise<number> {
  return client.contentRevisionPublishEvent.count({
    where: { contentType, contentId },
  });
}
