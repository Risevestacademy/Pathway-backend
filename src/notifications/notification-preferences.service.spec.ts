import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCategory } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { NOTIFICATION_CATEGORY_DEFAULTS } from './notification-preferences';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;

  const fn = () => jest.fn<(args: unknown) => Promise<unknown>>();

  const mockPrismaService = {
    notificationPreference: { findMany: fn(), upsert: fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.notificationPreference.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(NotificationPreferencesService);
  });

  describe('getForUser', () => {
    it('returns the defaults for a user with no rows', async () => {
      await expect(service.getForUser('user-1')).resolves.toEqual(
        NOTIFICATION_CATEGORY_DEFAULTS,
      );
      expect(
        mockPrismaService.notificationPreference.findMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { category: true, inAppEnabled: true, emailEnabled: true },
      });
    });

    it('merges partial rows over the defaults', async () => {
      mockPrismaService.notificationPreference.findMany.mockResolvedValue([
        {
          category: NotificationCategory.NEW_OPENINGS,
          inAppEnabled: false,
          emailEnabled: false,
        },
      ]);

      const preferences = await service.getForUser('user-1');

      expect(preferences.NEW_OPENINGS).toEqual({
        inAppEnabled: false,
        emailEnabled: false,
      });
      expect(preferences.STREAK_NUDGES).toEqual({
        inAppEnabled: true,
        emailEnabled: false,
      });
    });

    it('reads through the transaction it is given', async () => {
      const tx = { notificationPreference: { findMany: fn() } };
      tx.notificationPreference.findMany.mockResolvedValue([]);

      await service.getForUser(
        'user-1',
        tx as unknown as Pick<PrismaService, 'notificationPreference'>,
      );

      expect(tx.notificationPreference.findMany).toHaveBeenCalled();
      expect(
        mockPrismaService.notificationPreference.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateForUser', () => {
    beforeEach(() => {
      mockPrismaService.notificationPreference.upsert.mockResolvedValue({
        inAppEnabled: true,
        emailEnabled: true,
      });
    });

    it('upserts one row, creating it from the defaults plus the patch', async () => {
      const result = await service.updateForUser(
        'user-1',
        NotificationCategory.STREAK_NUDGES,
        { emailEnabled: true },
      );

      expect(
        mockPrismaService.notificationPreference.upsert,
      ).toHaveBeenCalledWith({
        where: {
          userId_category: {
            userId: 'user-1',
            category: NotificationCategory.STREAK_NUDGES,
          },
        },
        create: {
          userId: 'user-1',
          category: NotificationCategory.STREAK_NUDGES,
          inAppEnabled: true,
          emailEnabled: true,
        },
        update: { emailEnabled: true },
        select: { inAppEnabled: true, emailEnabled: true },
      });
      expect(result).toEqual({ inAppEnabled: true, emailEnabled: true });
    });

    it('leaves an undefined channel out of the write and the log', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.updateForUser(
        'user-1',
        NotificationCategory.RESOURCE_LINK_PROBLEMS,
        { inAppEnabled: false, emailEnabled: undefined },
      );

      const [[args]] =
        mockPrismaService.notificationPreference.upsert.mock.calls;
      expect(args).toMatchObject({
        create: { inAppEnabled: false, emailEnabled: false },
      });
      expect((args as { update: object }).update).toStrictEqual({
        inAppEnabled: false,
      });
      expect(logSpy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          category: NotificationCategory.RESOURCE_LINK_PROBLEMS,
          channels: ['inAppEnabled'],
        },
        'Notification preference updated',
      );
      logSpy.mockRestore();
    });

    it('sends the same single upsert when repeated, so a repeat changes nothing', async () => {
      const patch = { inAppEnabled: false };

      await service.updateForUser(
        'user-1',
        NotificationCategory.NEW_OPENINGS,
        patch,
      );
      await service.updateForUser(
        'user-1',
        NotificationCategory.NEW_OPENINGS,
        patch,
      );

      const [first, second] =
        mockPrismaService.notificationPreference.upsert.mock.calls;
      expect(second).toEqual(first);
    });
  });

  describe('isEnabled', () => {
    it('uses the default when the user has no row', async () => {
      await expect(
        service.isEnabled(
          'user-1',
          NotificationCategory.RESOURCE_LINK_PROBLEMS,
          'email',
        ),
      ).resolves.toBe(false);
    });

    it('respects a stored patch', async () => {
      mockPrismaService.notificationPreference.findMany.mockResolvedValue([
        {
          category: NotificationCategory.FEEDBACK_REPLIES,
          inAppEnabled: false,
          emailEnabled: true,
        },
      ]);

      await expect(
        service.isEnabled(
          'user-1',
          NotificationCategory.FEEDBACK_REPLIES,
          'inApp',
        ),
      ).resolves.toBe(false);
      await expect(
        service.isEnabled(
          'user-1',
          NotificationCategory.FEEDBACK_REPLIES,
          'email',
        ),
      ).resolves.toBe(true);
    });
  });
});
