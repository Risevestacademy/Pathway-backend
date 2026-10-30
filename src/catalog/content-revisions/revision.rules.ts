import { Role } from '../../generated/prisma/client';

/** A revision is stale when the live career has moved on since it was based. */
export const isRevisionStale = (
  baseVersion: number,
  liveVersion: number,
): boolean => baseVersion !== liveVersion;

/** Separation of duties: nobody reviews their own revision, except an ADMIN. */
export const isSelfReviewBlocked = (
  revisionCreatorId: string,
  reviewer: { id: string; role: Role },
): boolean => revisionCreatorId === reviewer.id && reviewer.role !== Role.ADMIN;
