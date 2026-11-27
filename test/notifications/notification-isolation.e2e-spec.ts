import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import {
  NotificationCategory,
  NotificationTargetType,
  NotificationType,
} from '../../src/generated/prisma/client';
import {
  NOTIFICATION_CATEGORY_DEFAULTS,
  NotificationService,
} from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from '../utils/auth';

describe('Notification data between two users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let userA: RegisteredUser;
  let userB: RegisteredUser;
  const createdUserIds: string[] = [];

  const TARGET_ID = '7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
  const READ_AT = new Date('2026-11-24T12:00:00.000Z');

  const insert = async (
    owner: RegisteredUser,
    createdAt: string,
    isRead = false,
  ): Promise<string> => {
    const { id } = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: NotificationType.FEEDBACK_REPLIED,
        category: NotificationCategory.FEEDBACK_REPLIES,
        title: 'We replied to your feedback',
        body: 'Open it to read the reply.',
        isRead,
        readAt: isRead ? READ_AT : null,
        targetType: NotificationTargetType.FEEDBACK,
        targetId: TARGET_ID,
        createdAt: new Date(createdAt),
      },
      select: { id: true },
    });
    return id;
  };

  const readState = (id: string) =>
    prisma.notification.findUniqueOrThrow({
      where: { id },
      select: { isRead: true, readAt: true },
    });

  const get = (user: RegisteredUser, path: string) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/${path}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

  const patch = (user: RegisteredUser, path: string, body?: object) =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/me/${path}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);

  const listedIds = async (
    user: RegisteredUser,
    query = '',
  ): Promise<string[]> => {
    const { body } = await get(user, `notifications${query}`).expect(200);
    return body.items.map((item: { id: string }) => item.id);
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
    userA = await registerAndVerify(app, apiPrefix, {
      email: `e2e-notif-isolation-a-${stamp}@test.com`,
    });
    userB = await registerAndVerify(app, apiPrefix, {
      email: `e2e-notif-isolation-b-${stamp}@test.com`,
    });
    createdUserIds.push(userA.id, userB.id);
  });

  beforeEach(async () => {
    const where = { userId: { in: createdUserIds } };
    await prisma.notification.deleteMany({ where });
    await prisma.notificationPreference.deleteMany({ where });
  });

  afterAll(async () => {
    await cleanupUsers(prisma, createdUserIds);
    await app.close();
  });

  describe('inbox reads', () => {
    it.each(['', '?filter=unread'])(
      "lists only the caller's rows (query %j)",
      async (query) => {
        const a1 = await insert(userA, '2026-11-24T09:00:00.000Z');
        const b1 = await insert(userB, '2026-11-24T10:00:00.000Z');
        const a2 = await insert(userA, '2026-11-24T11:00:00.000Z');
        const b2 = await insert(userB, '2026-11-24T12:00:00.000Z');

        expect(await listedIds(userA, query)).toEqual([a2, a1]);
        expect(await listedIds(userB, query)).toEqual([b2, b1]);
      },
    );

    it("returns only the caller's rows for another user's cursor", async () => {
      const a1 = await insert(userA, '2026-11-24T08:00:00.000Z');
      await insert(userB, '2026-11-24T09:00:00.000Z');
      await insert(userB, '2026-11-24T10:00:00.000Z');

      const { body } = await get(userB, 'notifications?limit=1').expect(200);
      expect(typeof body.nextCursor).toBe('string');

      expect(await listedIds(userA, `?cursor=${body.nextCursor}`)).toEqual([
        a1,
      ]);
    });

    it("counts only the caller's unread rows", async () => {
      await insert(userA, '2026-11-24T09:00:00.000Z');
      await insert(userB, '2026-11-24T10:00:00.000Z');
      await insert(userB, '2026-11-24T11:00:00.000Z');

      const countFor = async (user: RegisteredUser) =>
        (await get(user, 'notifications/unread-count').expect(200)).body;

      expect(await countFor(userA)).toEqual({ count: 1 });
      expect(await countFor(userB)).toEqual({ count: 2 });
    });
  });

  describe('marking read', () => {
    it("returns 404 for another user's unread notification and leaves it unread", async () => {
      const theirs = await insert(userB, '2026-11-24T10:00:00.000Z');

      const { body } = await patch(
        userA,
        `notifications/${theirs}/read`,
      ).expect(404);

      expect(body.message).toBe('Notification not found');
      expect(await readState(theirs)).toEqual({ isRead: false, readAt: null });
    });

    it("returns 404 for another user's read notification and leaves it unchanged", async () => {
      const theirs = await insert(userB, '2026-11-24T10:00:00.000Z', true);

      await patch(userA, `notifications/${theirs}/read`).expect(404);

      expect(await readState(theirs)).toEqual({
        isRead: true,
        readAt: READ_AT,
      });
    });

    it("leaves another user's notifications unread on read-all", async () => {
      const mine = await insert(userA, '2026-11-24T09:00:00.000Z');
      const theirs = await insert(userB, '2026-11-24T10:00:00.000Z');

      await patch(userA, 'notifications/read-all').expect(200);

      expect((await readState(mine)).isRead).toBe(true);
      expect(await readState(theirs)).toEqual({ isRead: false, readAt: null });
      expect(await listedIds(userB, '?filter=unread')).toEqual([theirs]);
    });
  });

  describe('preferences', () => {
    const preferencesOf = async (user: RegisteredUser) =>
      (await get(user, 'notification-preferences').expect(200)).body;

    it("keeps one user's changes out of an untouched user's defaults", async () => {
      await patch(userA, 'notification-preferences/NEW_OPENINGS', {
        inAppEnabled: false,
      }).expect(200);

      expect(await preferencesOf(userB)).toEqual(
        NOTIFICATION_CATEGORY_DEFAULTS,
      );
    });

    it('keeps changes to the same category separate', async () => {
      await patch(userB, 'notification-preferences/NEW_OPENINGS', {
        emailEnabled: false,
      }).expect(200);
      const { body } = await patch(
        userA,
        'notification-preferences/NEW_OPENINGS',
        { inAppEnabled: false },
      ).expect(200);

      expect(body).toEqual({ inAppEnabled: false, emailEnabled: true });
      expect(await preferencesOf(userA)).toEqual({
        ...NOTIFICATION_CATEGORY_DEFAULTS,
        NEW_OPENINGS: { inAppEnabled: false, emailEnabled: true },
      });
      expect(await preferencesOf(userB)).toEqual({
        ...NOTIFICATION_CATEGORY_DEFAULTS,
        NEW_OPENINGS: { inAppEnabled: true, emailEnabled: false },
      });
    });
  });
});
