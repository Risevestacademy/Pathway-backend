/**
 * Producers call a dispatcher method inside their own transaction, so the
 * notification commits or rolls back with the change that caused it. The method
 * returns the emails to send; the producer sends them only after the
 * transaction resolves, with `void dispatcher.sendPendingEmails(pending).catch(log)`.
 * A failed email never undoes the change. `feedbackReplied` is the reference
 * shape for new dispatcher methods.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationTargetType,
  NotificationType,
  Prisma,
} from '../generated/prisma/client';
import { NotificationService } from './notification.service';
import { NOTIFICATION_EVENT_CATEGORY } from './notification-events';
import { NotificationPreferencesService } from './notification-preferences.service';
import type { NotificationTemplateName } from './templates/templates';
import { UserNotificationsService } from './user-notifications.service';

export interface PendingEmail {
  userId: string;
  type: NotificationType;
  to: string;
  template: NotificationTemplateName;
  data: Record<string, unknown>;
}

export interface FeedbackRepliedInput {
  feedbackId: string;
  recipientUserId: string;
  actorUserId: string;
}

export interface FeedbackResolvedInput {
  feedbackId: string;
  recipientUserId: string;
  actorUserId: string;
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly preferences: NotificationPreferencesService,
    private readonly notificationService: NotificationService,
    private readonly userNotifications: UserNotificationsService,
  ) {}

  async feedbackReplied(
    { feedbackId, recipientUserId, actorUserId }: FeedbackRepliedInput,
    tx: Prisma.TransactionClient,
  ): Promise<PendingEmail[]> {
    if (recipientUserId === actorUserId) return [];

    const type = NotificationType.FEEDBACK_REPLIED;
    const category = NOTIFICATION_EVENT_CATEGORY[type];
    const preference = (await this.preferences.getForUser(recipientUserId, tx))[
      category
    ];

    if (preference.inAppEnabled) {
      await this.userNotifications.createMany(
        [
          {
            userId: recipientUserId,
            type,
            category,
            title: 'We replied to your feedback',
            body: 'Our team replied to feedback you sent. Open it to read the reply.',
            targetType: NotificationTargetType.FEEDBACK,
            targetId: feedbackId,
          },
        ],
        tx,
      );
      this.logger.debug(
        { userId: recipientUserId, type, category },
        'Notification written',
      );
    }

    if (!preference.emailEnabled) return [];

    const recipient = await tx.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true },
    });
    if (!recipient) return [];

    return [
      {
        userId: recipientUserId,
        type,
        to: recipient.email,
        template: 'feedback-replied',
        data: {},
      },
    ];
  }

  async feedbackResolved(
    { feedbackId, recipientUserId, actorUserId }: FeedbackResolvedInput,
    tx: Prisma.TransactionClient,
  ): Promise<PendingEmail[]> {
    if (recipientUserId === actorUserId) return [];

    const type = NotificationType.FEEDBACK_RESOLVED;
    const category = NOTIFICATION_EVENT_CATEGORY[type];
    const preference = (await this.preferences.getForUser(recipientUserId, tx))[
      category
    ];

    if (preference.inAppEnabled) {
      await this.userNotifications.createMany(
        [
          {
            userId: recipientUserId,
            type,
            category,
            title: 'Your feedback was resolved',
            body: 'Our team resolved feedback you sent. Open it to see the outcome.',
            targetType: NotificationTargetType.FEEDBACK,
            targetId: feedbackId,
          },
        ],
        tx,
      );
      this.logger.debug(
        { userId: recipientUserId, type, category },
        'Notification written',
      );
    }

    if (!preference.emailEnabled) return [];

    const recipient = await tx.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true },
    });
    if (!recipient) return [];

    return [
      {
        userId: recipientUserId,
        type,
        to: recipient.email,
        template: 'feedback-resolved',
        data: {},
      },
    ];
  }

  async sendPendingEmails(pending: readonly PendingEmail[]): Promise<void> {
    const results = await Promise.allSettled(
      pending.map(({ to, template, data }) =>
        this.notificationService.send(to, template, data),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;

      // Provider errors can carry the recipient and the rendered email
      const { userId, type } = pending[index];
      this.logger.warn(
        {
          userId,
          type,
          reason: 'EMAIL_SEND_FAILED',
          error:
            result.reason instanceof Error ? result.reason.name : 'Unknown',
        },
        'Notification email failed',
      );
    });
  }
}
