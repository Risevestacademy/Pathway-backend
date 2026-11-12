import { FeedbackTargetType, type Prisma } from '../generated/prisma/client';
import type { PublicFeedbackDto } from './dto/public-feedback.dto';

// Notes and the reporter's email are deliberately not selected, so they can
// never reach a response built from this select.
export const PUBLIC_FEEDBACK_SELECT = {
  id: true,
  category: true,
  section: true,
  targetType: true,
  targetId: true,
  description: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ContentFeedbackSelect;

type PublicFeedbackRow = Prisma.ContentFeedbackGetPayload<{
  select: typeof PUBLIC_FEEDBACK_SELECT;
}>;

export const toPublicFeedback = (
  row: PublicFeedbackRow,
): PublicFeedbackDto => ({
  id: row.id,
  category: row.category,
  section: row.section,
  targetType: row.targetType ?? FeedbackTargetType.OTHER,
  targetId: row.targetId,
  description: row.description,
  status: row.status,
  createdAt: row.createdAt,
});
