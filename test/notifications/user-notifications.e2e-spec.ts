import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import {
  NotificationCategory,
  NotificationType,
} from '../../src/generated/prisma/client';
import {
  NotificationService,
  UserNotificationsService,
} from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { notificationMock } from '../utils/auth';

describe('UserNotificationsService (real database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let service: UserNotificationsService;
  let userId: string;
  let otherUserId: string;

  const SHARED_TIME = new Date('2026-11-24T09:00:00.000Z');

  const insert = (
    ownerId: string,
    createdAt: Date,
    isRead = false,
  ): Promise<{ id: string }> =>
    prisma.notification.create({
      data: {
        userId: ownerId,
        type: NotificationType.FEEDBACK_REPLIED,
        category: NotificationCategory.FEEDBACK_REPLIES,
        title: 'We replied to your feedback',
        body: 'Our team replied to feedback you sent. Open it to read the reply.',
        isRead,
        readAt: isRead ? createdAt : null,
        createdAt,
      },
      select: { id: true },
    });

  const readAllPages = async (owner: string, limit: number) => {
    const ids: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await service.list(owner, { limit, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return ids;
  };

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    prisma = moduleFixture.get(PrismaService);
    service = moduleFixture.get(UserNotificationsService);
  });

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    userId = (
      await prisma.user.create({
        data: { email: `e2e-inbox-a-${stamp}@test.com` },
      })
    ).id;
    otherUserId = (
      await prisma.user.create({
        data: { email: `e2e-inbox-b-${stamp}@test.com` },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
  });

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('pages through rows that share a creation time without skipping or repeating any', async () => {
    const older = await insert(userId, new Date('2026-11-23T09:00:00.000Z'));
    const shared = await Promise.all(
      [0, 1, 2, 3].map(() => insert(userId, SHARED_TIME)),
    );
    const newer = await insert(userId, new Date('2026-11-25T09:00:00.000Z'));
    await insert(otherUserId, SHARED_TIME);

    const sharedDescending = shared
      .map(({ id }) => id)
      .sort()
      .reverse();

    await expect(readAllPages(userId, 2)).resolves.toEqual([
      newer.id,
      ...sharedDescending,
      older.id,
    ]);
  });

  it('lists only unread rows of the caller for the unread filter', async () => {
    const unread = await insert(userId, SHARED_TIME);
    await insert(userId, SHARED_TIME, true);
    await insert(otherUserId, SHARED_TIME);

    const page = await service.list(userId, { filter: 'unread' });

    expect(page.items.map((item) => item.id)).toEqual([unread.id]);
    expect(page.nextCursor).toBeNull();
  });

  it('keeps the unread count exact through markRead and markAllRead', async () => {
    const first = await insert(userId, SHARED_TIME);
    await insert(userId, SHARED_TIME);
    await insert(userId, SHARED_TIME, true);
    await insert(otherUserId, SHARED_TIME);

    await expect(service.unreadCount(userId)).resolves.toBe(2);

    await service.markRead(userId, first.id);
    await service.markRead(userId, first.id);
    await expect(service.unreadCount(userId)).resolves.toBe(1);

    await expect(service.markAllRead(userId)).resolves.toEqual({
      unreadCount: 0,
    });
    await expect(service.unreadCount(userId)).resolves.toBe(0);
    await expect(service.unreadCount(otherUserId)).resolves.toBe(1);
  });

  it('returns 404 for a row owned by another user and leaves it unread', async () => {
    const theirs = await insert(otherUserId, SHARED_TIME);

    await expect(service.markRead(userId, theirs.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      prisma.notification.findUnique({
        where: { id: theirs.id },
        select: { isRead: true, readAt: true },
      }),
    ).resolves.toEqual({ isRead: false, readAt: null });
  });
});
