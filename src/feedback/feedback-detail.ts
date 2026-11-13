import type { Prisma } from '../generated/prisma/client';
import type { AdminFeedbackDetailDto } from './dto/admin-feedback-detail.dto';
import {
  FEEDBACK_LIST_SELECT,
  type FeedbackListRow,
  toAdminFeedbackListItem,
} from './feedback-list';

export const FEEDBACK_NOTE_SELECT = {
  id: true,
  feedbackId: true,
  authorId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.FeedbackNoteSelect;

// The only select that reads notes. The public select never does.
export const FEEDBACK_DETAIL_SELECT = {
  ...FEEDBACK_LIST_SELECT,
  notes: {
    select: FEEDBACK_NOTE_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ContentFeedbackSelect;

export type FeedbackDetailRow = Prisma.ContentFeedbackGetPayload<{
  select: typeof FEEDBACK_DETAIL_SELECT;
}>;

export const toAdminFeedbackDetail = (
  { notes, ...row }: FeedbackDetailRow,
  label: string | null,
): AdminFeedbackDetailDto => ({
  ...toAdminFeedbackListItem(row satisfies FeedbackListRow, label),
  notes,
});
