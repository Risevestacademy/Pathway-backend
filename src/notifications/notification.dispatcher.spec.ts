import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationCategory,
  NotificationTargetType,
  NotificationType,
  Prisma,
} from '../generated/prisma/client';
import { NotificationService } from './notification.service';
import { NOTIFICATION_EVENT_CATEGORY } from './notification-events';
import {
  NOTIFICATION_CATEGORY_DEFAULTS,
  type ChannelPreference,
  type NotificationPreferenceMap,
} from './notification-preferences';
import { NotificationPreferencesService } from './notification-preferences.service';
import {
  NotificationDispatcher,
  type PendingEmail,
} from './notification.dispatcher';
import { UserNotificationsService } from './user-notifications.service';

describe('NOTIFICATION_EVENT_CATEGORY', () => {
  it('gives every notification type a category', () => {
    expect(Object.keys(NOTIFICATION_EVENT_CATEGORY).sort()).toEqual(
      Object.values(NotificationType).sort(),
    );
  });

  it('files both feedback types under replies to your feedback', () => {
    expect(NOTIFICATION_EVENT_CATEGORY).toEqual({
      FEEDBACK_REPLIED: NotificationCategory.FEEDBACK_REPLIES,
      FEEDBACK_RESOLVED: NotificationCategory.FEEDBACK_REPLIES,
    });
  });
});

describe('NotificationDispatcher', () => {
  let dispatcher: NotificationDispatcher;

  const mockPreferences = {
    getForUser:
      jest.fn<
        (userId: string, tx?: unknown) => Promise<NotificationPreferenceMap>
      >(),
  };
  const mockNotificationService = {
    send: jest.fn<
      (
        to: string,
        template: string,
        data: Record<string, unknown>,
      ) => Promise<void>
    >(),
  };
  const mockUserNotifications = {
    createMany: jest.fn<(rows: unknown, tx: unknown) => Promise<number>>(),
  };
  const tx = {
    user: { findUnique: jest.fn<(args: unknown) => Promise<unknown>>() },
  };
  const txClient = tx as unknown as Prisma.TransactionClient;

  const input = {
    feedbackId: 'feedback-1',
    recipientUserId: 'user-1',
    actorUserId: 'admin-1',
  };

  const withFeedbackPreference = (preference: ChannelPreference) =>
    mockPreferences.getForUser.mockResolvedValue({
      ...NOTIFICATION_CATEGORY_DEFAULTS,
      FEEDBACK_REPLIES: preference,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    withFeedbackPreference({ inAppEnabled: true, emailEnabled: true });
    mockUserNotifications.createMany.mockResolvedValue(1);
    tx.user.findUnique.mockResolvedValue({ email: 'user@example.com' });
    mockNotificationService.send.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatcher,
        { provide: NotificationPreferencesService, useValue: mockPreferences },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: UserNotificationsService, useValue: mockUserNotifications },
      ],
    }).compile();

    dispatcher = module.get(NotificationDispatcher);
  });

  describe('feedbackReplied', () => {
    it('writes one row with the feedback category and target through the transaction', async () => {
      await dispatcher.feedbackReplied(input, txClient);

      expect(mockPreferences.getForUser).toHaveBeenCalledWith(
        'user-1',
        txClient,
      );
      expect(mockUserNotifications.createMany).toHaveBeenCalledWith(
        [
          {
            userId: 'user-1',
            type: NotificationType.FEEDBACK_REPLIED,
            category: NotificationCategory.FEEDBACK_REPLIES,
            title: 'We replied to your feedback',
            body: 'Our team replied to feedback you sent. Open it to read the reply.',
            targetType: NotificationTargetType.FEEDBACK,
            targetId: 'feedback-1',
          },
        ],
        txClient,
      );
    });

    it('writes nothing when in-app is off', async () => {
      withFeedbackPreference({ inAppEnabled: false, emailEnabled: true });

      await dispatcher.feedbackReplied(input, txClient);

      expect(mockUserNotifications.createMany).not.toHaveBeenCalled();
    });

    it('returns a pending email when email is on', async () => {
      const pending = await dispatcher.feedbackReplied(input, txClient);

      expect(tx.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { email: true },
      });
      expect(pending).toEqual([
        {
          userId: 'user-1',
          type: NotificationType.FEEDBACK_REPLIED,
          to: 'user@example.com',
          template: 'feedback-replied',
          data: {},
        },
      ]);
    });

    it('returns no email, and reads no address, when email is off', async () => {
      withFeedbackPreference({ inAppEnabled: true, emailEnabled: false });

      const pending = await dispatcher.feedbackReplied(input, txClient);

      expect(pending).toEqual([]);
      expect(tx.user.findUnique).not.toHaveBeenCalled();
      expect(mockUserNotifications.createMany).toHaveBeenCalled();
    });

    it('produces nothing when the recipient is the actor', async () => {
      const pending = await dispatcher.feedbackReplied(
        { ...input, actorUserId: 'user-1' },
        txClient,
      );

      expect(pending).toEqual([]);
      expect(mockPreferences.getForUser).not.toHaveBeenCalled();
      expect(mockUserNotifications.createMany).not.toHaveBeenCalled();
    });

    it('sends nothing itself', async () => {
      await dispatcher.feedbackReplied(input, txClient);

      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
  });

  describe('sendPendingEmails', () => {
    const email = (userId: string): PendingEmail => ({
      userId,
      type: NotificationType.FEEDBACK_REPLIED,
      to: `${userId}@example.com`,
      template: 'feedback-replied',
      data: {},
    });

    it('sends each pending email', async () => {
      await dispatcher.sendPendingEmails([email('user-1'), email('user-2')]);

      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'user-1@example.com',
        'feedback-replied',
        {},
      );
    });

    it('keeps sending after a failure and does not reject', async () => {
      mockNotificationService.send
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValueOnce(undefined);

      await expect(
        dispatcher.sendPendingEmails([email('user-1'), email('user-2')]),
      ).resolves.toBeUndefined();
      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);
    });
  });
});
