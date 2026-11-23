import {
  NotificationCategory,
  NotificationType,
} from '../generated/prisma/client';

// The settings category that governs each notification type
export const NOTIFICATION_EVENT_CATEGORY: Readonly<
  Record<NotificationType, NotificationCategory>
> = {
  [NotificationType.FEEDBACK_REPLIED]: NotificationCategory.FEEDBACK_REPLIES,
  [NotificationType.FEEDBACK_RESOLVED]: NotificationCategory.FEEDBACK_REPLIES,
};
