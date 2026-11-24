import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import {
  NotificationCategory,
  NotificationTargetType,
  NotificationType,
} from '../../src/generated/prisma/client';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from '../utils/auth';

describe('Me — Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let user: RegisteredUser;
  let otherUser: RegisteredUser;
  const createdUserIds: string[] = [];

  const MISSING_ID = '7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

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
        targetType: NotificationTargetType.FEEDBACK,
        targetId: MISSING_ID,
        createdAt,
      },
      select: { id: true },
    });

  const authed = (method: 'get' | 'patch', path: string, as = user) => {
    const server = request(app.getHttpServer());
    const url = `${apiPrefix}/me/notifications${path}`;
    const req = method === 'get' ? server.get(url) : server.patch(url);

    return req.set('Authorization', `Bearer ${as.accessToken}`);
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(app.get<ConfigService<EnvironmentVariables, true>>(ConfigService))}`;
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    wireNotificationMock();

    const stamp = Date.now();
    user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-me-notifications-a-${stamp}@test.com`,
    });
    otherUser = await registerAndVerify(app, apiPrefix, {
      email: `e2e-me-notifications-b-${stamp}@test.com`,
    });
    createdUserIds.push(user.id, otherUser.id);
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
  });

  afterAll(async () => {
    await cleanupUsers(prisma, createdUserIds);
    await app.close();
  });

  describe('GET /me/notifications', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/me/notifications`)
        .expect(401);
    });

    it('returns an empty page for a new user', async () => {
      const res = await authed('get', '').expect(200);

      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it("pages through the caller's notifications, newest first", async () => {
      const older = await insert(user.id, new Date('2026-11-23T09:00:00.000Z'));
      const newer = await insert(user.id, new Date('2026-11-24T09:00:00.000Z'));
      await insert(otherUser.id, new Date('2026-11-24T10:00:00.000Z'));

      const first = await authed('get', '?limit=1').expect(200);

      expect(first.body.items).toEqual([
        {
          id: newer.id,
          type: 'FEEDBACK_REPLIED',
          category: 'FEEDBACK_REPLIES',
          title: 'We replied to your feedback',
          body: 'Our team replied to feedback you sent. Open it to read the reply.',
          isRead: false,
          readAt: null,
          targetType: 'FEEDBACK',
          targetId: MISSING_ID,
          createdAt: '2026-11-24T09:00:00.000Z',
        },
      ]);
      expect(typeof first.body.nextCursor).toBe('string');

      const second = await authed(
        'get',
        `?limit=1&cursor=${first.body.nextCursor}`,
      ).expect(200);

      expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([
        older.id,
      ]);
      expect(second.body.nextCursor).toBeNull();
    });

    it('excludes read notifications for filter=unread', async () => {
      const unread = await insert(user.id, new Date());
      await insert(user.id, new Date(), true);

      const res = await authed('get', '?filter=unread').expect(200);

      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
        unread.id,
      ]);
    });

    it('returns 400 for a limit above 50', async () => {
      const res = await authed('get', '?limit=51').expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a malformed cursor', async () => {
      const res = await authed('get', '?cursor=not-a-cursor').expect(400);

      expect(res.body.code).toBe('INVALID_CURSOR');
    });
  });

  describe('GET /me/notifications/unread-count', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/me/notifications/unread-count`)
        .expect(401);
    });

    it("counts only the caller's unread notifications", async () => {
      await insert(user.id, new Date());
      await insert(user.id, new Date());
      await insert(user.id, new Date(), true);
      await insert(otherUser.id, new Date());

      const res = await authed('get', '/unread-count').expect(200);

      expect(res.body).toEqual({ count: 2 });
    });
  });

  describe('PATCH /me/notifications/:id/read', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/me/notifications/${MISSING_ID}/read`)
        .expect(401);
    });

    it('marks the notification read and the unread count follows', async () => {
      const notification = await insert(user.id, new Date());
      await insert(user.id, new Date());

      await authed('patch', `/${notification.id}/read`).expect(204);
      await authed('patch', `/${notification.id}/read`).expect(204);

      const count = await authed('get', '/unread-count').expect(200);
      expect(count.body).toEqual({ count: 1 });

      const stored = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
        select: { isRead: true, readAt: true },
      });
      expect(stored.isRead).toBe(true);
      expect(stored.readAt).toBeInstanceOf(Date);
    });

    it("returns 404 for another user's notification and leaves it unread", async () => {
      const theirs = await insert(otherUser.id, new Date());

      await authed('patch', `/${theirs.id}/read`).expect(404);

      const stored = await prisma.notification.findUniqueOrThrow({
        where: { id: theirs.id },
        select: { isRead: true },
      });
      expect(stored.isRead).toBe(false);
    });

    it('returns 404 for an unknown id', async () => {
      await authed('patch', `/${MISSING_ID}/read`).expect(404);
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await authed('patch', '/not-a-uuid/read').expect(400);
    });
  });

  describe('PATCH /me/notifications/read-all', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/me/notifications/read-all`)
        .expect(401);
    });

    it("marks every one of the caller's notifications read", async () => {
      await insert(user.id, new Date());
      await insert(user.id, new Date());
      await insert(otherUser.id, new Date());

      const res = await authed('patch', '/read-all').expect(200);
      expect(res.body).toEqual({ unreadCount: 0 });

      const count = await authed('get', '/unread-count').expect(200);
      expect(count.body).toEqual({ count: 0 });

      const theirs = await authed('get', '/unread-count', otherUser).expect(
        200,
      );
      expect(theirs.body).toEqual({ count: 1 });
    });
  });
});
