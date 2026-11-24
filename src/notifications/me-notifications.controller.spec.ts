import { jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard, type AuthenticatedUser } from '../common';
import type { NotificationPageDto } from './dto/notification-page.dto';
import { MeNotificationsController } from './me-notifications.controller';
import {
  type ListNotificationsOptions,
  UserNotificationsService,
} from './user-notifications.service';

describe('MeNotificationsController', () => {
  let controller: MeNotificationsController;

  const mockUserNotifications = {
    list: jest.fn<
      (
        userId: string,
        options: ListNotificationsOptions,
      ) => Promise<NotificationPageDto>
    >(),
    unreadCount: jest.fn<(userId: string) => Promise<number>>(),
    markRead: jest.fn<(userId: string, id: string) => Promise<void>>(),
    markAllRead: jest.fn<(userId: string) => Promise<{ unreadCount: 0 }>>(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeNotificationsController],
      providers: [
        { provide: UserNotificationsService, useValue: mockUserNotifications },
      ],
    }).compile();

    controller = module.get(MeNotificationsController);
  });

  it('requires an authenticated user', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      MeNotificationsController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  it("delegates the caller's id and the query to list", async () => {
    const page: NotificationPageDto = { items: [], nextCursor: null };
    mockUserNotifications.list.mockResolvedValue(page);
    const query = { filter: 'unread' as const, cursor: 'abc', limit: 10 };

    await expect(controller.listMyNotifications(user, query)).resolves.toBe(
      page,
    );
    expect(mockUserNotifications.list).toHaveBeenCalledWith('user-1', query);
  });

  it('wraps the unread count', async () => {
    mockUserNotifications.unreadCount.mockResolvedValue(3);

    await expect(controller.getUnreadCount(user)).resolves.toEqual({
      count: 3,
    });
    expect(mockUserNotifications.unreadCount).toHaveBeenCalledWith('user-1');
  });

  it('delegates markRead', async () => {
    mockUserNotifications.markRead.mockResolvedValue(undefined);

    await controller.markRead(user, 'notification-1');

    expect(mockUserNotifications.markRead).toHaveBeenCalledWith(
      'user-1',
      'notification-1',
    );
  });

  it('delegates markAllRead', async () => {
    mockUserNotifications.markAllRead.mockResolvedValue({ unreadCount: 0 });

    await expect(controller.markAllRead(user)).resolves.toEqual({
      unreadCount: 0,
    });
    expect(mockUserNotifications.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
