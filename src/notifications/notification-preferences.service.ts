import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import {
  type ChannelPreference,
  isChannelEnabled,
  mergePreferences,
  NOTIFICATION_CATEGORY_DEFAULTS,
  type NotificationChannel,
  type NotificationPreferenceMap,
} from './notification-preferences';

type PreferenceClient = Pick<PrismaService, 'notificationPreference'>;

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getForUser(
    userId: string,
    tx: PreferenceClient = this.prisma,
  ): Promise<NotificationPreferenceMap> {
    const rows = await tx.notificationPreference.findMany({
      where: { userId },
      select: { category: true, inAppEnabled: true, emailEnabled: true },
    });

    return mergePreferences(rows);
  }

  async updateForUser(
    userId: string,
    category: NotificationCategory,
    patch: Partial<ChannelPreference>,
    tx: PreferenceClient = this.prisma,
  ): Promise<ChannelPreference> {
    const preference = await tx.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: {
        userId,
        category,
        ...NOTIFICATION_CATEGORY_DEFAULTS[category],
        ...patch,
      },
      update: patch,
      select: { inAppEnabled: true, emailEnabled: true },
    });

    this.logger.log(
      { userId, category, channels: Object.keys(patch) },
      'Notification preference updated',
    );

    return preference;
  }

  async isEnabled(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
    tx: PreferenceClient = this.prisma,
  ): Promise<boolean> {
    const preferences = await this.getForUser(userId, tx);
    return isChannelEnabled(preferences[category], channel);
  }
}
