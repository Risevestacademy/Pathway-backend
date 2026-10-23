import { FeedbackCategory } from '../generated/prisma/client';

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  [FeedbackCategory.INCORRECT_CONTENT]: 'Incorrect content',
  [FeedbackCategory.BROKEN_LINK]: 'Broken link',
  [FeedbackCategory.USABILITY]: 'Usability issue',
  [FeedbackCategory.OTHER]: 'Other',
};
