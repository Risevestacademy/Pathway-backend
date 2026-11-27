import { jest } from '@jest/globals';
import { ParseEnumPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard, type AuthenticatedUser } from '../common';
import { NotificationCategory } from '../generated/prisma/client';
import { MeNotificationPreferencesController } from './me-notification-preferences.controller';
import {
  type ChannelPreference,
  NOTIFICATION_CATEGORY_DEFAULTS,
  type NotificationPreferenceMap,
} from './notification-preferences';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('MeNotificationPreferencesController', () => {
  let controller: MeNotificationPreferencesController;

  const mockNotificationPreferencesService = {
    getForUser:
      jest.fn<(userId: string) => Promise<NotificationPreferenceMap>>(),
    updateForUser:
      jest.fn<
        (
          userId: string,
          category: NotificationCategory,
          patch: Partial<ChannelPreference>,
        ) => Promise<ChannelPreference>
      >(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeNotificationPreferencesController],
      providers: [
        {
          provide: NotificationPreferencesService,
          useValue: mockNotificationPreferencesService,
        },
      ],
    }).compile();

    controller = module.get(MeNotificationPreferencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('requires an authenticated user', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      MeNotificationPreferencesController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  describe('getMyPreferences', () => {
    it("returns the caller's preferences", async () => {
      mockNotificationPreferencesService.getForUser.mockResolvedValue(
        NOTIFICATION_CATEGORY_DEFAULTS,
      );

      const result = await controller.getMyPreferences(user);

      expect(
        mockNotificationPreferencesService.getForUser,
      ).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(NOTIFICATION_CATEGORY_DEFAULTS);
    });
  });

  describe('updateMyPreference', () => {
    it("updates the caller's category and returns it", async () => {
      const preference = { inAppEnabled: false, emailEnabled: true };
      mockNotificationPreferencesService.updateForUser.mockResolvedValue(
        preference,
      );

      const result = await controller.updateMyPreference(
        user,
        NotificationCategory.NEW_OPENINGS,
        { inAppEnabled: false },
      );

      expect(
        mockNotificationPreferencesService.updateForUser,
      ).toHaveBeenCalledWith('user-1', NotificationCategory.NEW_OPENINGS, {
        inAppEnabled: false,
      });
      expect(result).toEqual(preference);
    });

    it('rejects an unknown category', async () => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        MeNotificationPreferencesController,
        'updateMyPreference',
      ) as Record<string, { data?: string; pipes: unknown[] }>;
      const [pipe] = Object.values(args).find(
        ({ data }) => data === 'category',
      )!.pipes as [ParseEnumPipe];

      await expect(
        pipe.transform('UNKNOWN', { type: 'param' }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pipe.transform('NEW_OPENINGS', { type: 'param' }),
      ).resolves.toBe(NotificationCategory.NEW_OPENINGS);
    });
  });
});
