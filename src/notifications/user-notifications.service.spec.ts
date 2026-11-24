import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../common';
import {
  NotificationCategory,
  NotificationType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import {
  notificationItemSelect,
  type NotificationItemRow,
} from './notification-inbox';
import { UserNotificationsService } from './user-notifications.service';

const ID_A = '0b7a6f3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b';
const ID_B = '5d2c8a41-7e3b-4f6a-9c0d-2b1e4f7a8c93';
const CREATED_AT = new Date('2026-11-24T09:15:30.123Z');

const row = (id: string): NotificationItemRow => ({
  id,
  type: NotificationType.FEEDBACK_REPLIED,
  category: NotificationCategory.FEEDBACK_REPLIES,
  title: 'We replied to your feedback',
  body: 'Our team replied to feedback you sent. Open it to read the reply.',
  isRead: false,
  readAt: null,
  targetType: null,
  targetId: null,
  createdAt: CREATED_AT,
});

describe('UserNotificationsService', () => {
  let service: UserNotificationsService;

  const fn = () => jest.fn<(args: unknown) => Promise<unknown>>();

  const mockPrismaService = {
    notification: {
      findMany: fn(),
      findFirst: fn(),
      count: fn(),
      updateMany: fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.notification.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserNotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(UserNotificationsService);
  });

  describe('list', () => {
    it('reads the newest page of the caller only, one row past the limit', async () => {
      await service.list('user-1');

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        select: notificationItemSelect,
      });
    });

    it('excludes read rows for the unread filter', async () => {
      await service.list('user-1', { filter: 'unread' });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
      );
    });

    it('caps the limit at 50', async () => {
      await service.list('user-1', { limit: 500 });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }),
      );
    });

    it('continues after a cursor whose time other rows share, using the id', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([
        row(ID_B),
        row(ID_A),
      ]);
      const first = await service.list('user-1', { limit: 1 });

      expect(first.items).toEqual([row(ID_B)]);
      expect(first.nextCursor).not.toBeNull();

      await service.list('user-1', {
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });

      expect(mockPrismaService.notification.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            AND: {
              OR: [
                { createdAt: { lt: CREATED_AT } },
                { createdAt: CREATED_AT, id: { lt: ID_B } },
              ],
            },
          },
        }),
      );
    });

    it('returns no cursor on the last page', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([
        row(ID_A),
      ]);

      await expect(service.list('user-1', { limit: 1 })).resolves.toEqual({
        items: [row(ID_A)],
        nextCursor: null,
      });
    });

    it('rejects a malformed cursor with 400 INVALID_CURSOR', async () => {
      await expect(
        service.list('user-1', { cursor: 'not-a-cursor' }),
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR', status: 400 });
      await expect(
        service.list('user-1', { cursor: 'not-a-cursor' }),
      ).rejects.toBeInstanceOf(DomainException);
      expect(mockPrismaService.notification.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unreadCount', () => {
    it('counts the unread rows of the caller', async () => {
      mockPrismaService.notification.count.mockResolvedValue(3);

      await expect(service.unreadCount('user-1')).resolves.toBe(3);
      expect(mockPrismaService.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });
  });

  describe('markRead', () => {
    it('marks an unread row of the caller read', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.markRead('user-1', ID_A)).resolves.toBeUndefined();
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { id: ID_A, userId: 'user-1', isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(mockPrismaService.notification.findFirst).not.toHaveBeenCalled();
    });

    it('is a no-op success for a row already read', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.notification.findFirst.mockResolvedValue({ id: ID_A });

      await expect(service.markRead('user-1', ID_A)).resolves.toBeUndefined();
      expect(mockPrismaService.notification.findFirst).toHaveBeenCalledWith({
        where: { id: ID_A, userId: 'user-1' },
        select: { id: true },
      });
    });

    it('returns 404 for an id owned by another user', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-2', ID_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('marks every unread row of the caller read and returns a zero count', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 4 });

      await expect(service.markAllRead('user-1')).resolves.toEqual({
        unreadCount: 0,
      });
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });
  });

  describe('createMany', () => {
    const tx = { notification: { createMany: fn() } };
    const txClient = tx as unknown as Prisma.TransactionClient;
    const data: Prisma.NotificationCreateManyInput = {
      userId: 'user-1',
      type: NotificationType.FEEDBACK_REPLIED,
      category: NotificationCategory.FEEDBACK_REPLIES,
      title: 'We replied to your feedback',
      body: 'Our team replied to feedback you sent. Open it to read the reply.',
    };

    it('writes the rows through the transaction it is given', async () => {
      tx.notification.createMany.mockResolvedValue({ count: 1 });

      await expect(service.createMany([data], txClient)).resolves.toBe(1);
      expect(tx.notification.createMany).toHaveBeenCalledWith({
        data: [data],
      });
    });

    it('sends no query for an empty list', async () => {
      await expect(service.createMany([], txClient)).resolves.toBe(0);
      expect(tx.notification.createMany).not.toHaveBeenCalled();
    });
  });
});
