import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DomainException } from '../common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import type { NotificationPageDto } from './dto/notification-page.dto';
import {
  afterCursorWhere,
  decodeNotificationCursor,
  notificationItemSelect,
  type NotificationFilter,
  resolveNotificationLimit,
  toNotificationPage,
} from './notification-inbox';

export interface ListNotificationsOptions {
  filter?: NotificationFilter;
  cursor?: string;
  limit?: number;
}

type NotificationClient = Pick<Prisma.TransactionClient, 'notification'>;

@Injectable()
export class UserNotificationsService {
  private readonly logger = new Logger(UserNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    { filter = 'all', cursor, limit }: ListNotificationsOptions = {},
  ): Promise<NotificationPageDto> {
    const take = resolveNotificationLimit(limit);
    const where: Prisma.NotificationWhereInput = { userId };

    if (filter === 'unread') where.isRead = false;

    if (cursor) {
      const position = decodeNotificationCursor(cursor);
      if (!position)
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'INVALID_CURSOR',
          'Invalid cursor',
        );
      where.AND = afterCursorWhere(position);
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: notificationItemSelect,
    });

    return toNotificationPage(rows, take);
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    if (count > 0) {
      this.logger.log(
        { userId, notificationId: id },
        'Notification marked read',
      );
      return;
    }

    const owned = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!owned) {
      this.logger.warn(
        { userId, notificationId: id, reason: 'NOTIFICATION_NOT_FOUND' },
        'Notification not marked read',
      );
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<{ unreadCount: 0 }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    this.logger.log({ userId, count }, 'All notifications marked read');

    return { unreadCount: 0 };
  }

  async createMany(
    rows: readonly Prisma.NotificationCreateManyInput[],
    tx: NotificationClient,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const { count } = await tx.notification.createMany({ data: [...rows] });
    return count;
  }
}
