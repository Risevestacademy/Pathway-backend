import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationCategory } from '../../src/generated/prisma/client';
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

describe('Me — Notification preferences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  const createdUserIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-notif-prefs-${label}-${Date.now()}@test.com`,
    });
    createdUserIds.push(user.id);
    return user;
  };

  const getPreferences = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/notification-preferences`)
      .set('Authorization', `Bearer ${user.accessToken}`);

  const patchPreference = (
    user: RegisteredUser,
    category: string,
    body?: object,
  ) =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/me/notification-preferences/${category}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);

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
  });

  afterAll(async () => {
    await cleanupUsers(prisma, createdUserIds);
    await app.close();
  });

  describe('GET /me/notification-preferences', () => {
    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/me/notification-preferences`)
        .expect(401);
    });

    it('returns the six categories with their defaults and stores nothing', async () => {
      const user = await registerUser('defaults');

      const { body } = await getPreferences(user).expect(200);

      expect(Object.keys(body)).toHaveLength(6);
      expect(body).toEqual(NOTIFICATION_CATEGORY_DEFAULTS);
      expect(
        await prisma.notificationPreference.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  });

  describe('PATCH /me/notification-preferences/:category', () => {
    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/me/notification-preferences/NEW_OPENINGS`)
        .send({ inAppEnabled: false })
        .expect(401);
    });

    it('changes only the channel sent on a category with no stored row', async () => {
      const user = await registerUser('first');

      const { body } = await patchPreference(user, 'STREAK_NUDGES', {
        inAppEnabled: false,
      }).expect(200);

      expect(body).toEqual({ inAppEnabled: false, emailEnabled: false });
      expect((await getPreferences(user).expect(200)).body).toEqual({
        ...NOTIFICATION_CATEGORY_DEFAULTS,
        STREAK_NUDGES: { inAppEnabled: false, emailEnabled: false },
      });
    });

    it('changes only the channel sent on a category with a stored row', async () => {
      const user = await registerUser('second');

      await patchPreference(user, 'NEW_OPENINGS', {
        inAppEnabled: false,
        emailEnabled: false,
      }).expect(200);
      const { body } = await patchPreference(user, 'NEW_OPENINGS', {
        emailEnabled: true,
      }).expect(200);

      expect(body).toEqual({ inAppEnabled: false, emailEnabled: true });
    });

    it.each(Object.values(NotificationCategory))(
      'accepts %s',
      async (category) => {
        const user = await registerUser(category.toLowerCase());

        const { body } = await patchPreference(user, category, {
          emailEnabled: true,
          inAppEnabled: false,
        }).expect(200);

        expect(body).toEqual({ inAppEnabled: false, emailEnabled: true });
      },
    );

    it.each([{}, undefined])(
      'returns 400 for an empty body (%j)',
      async (sent) => {
        const user = await registerUser(sent ? 'empty' : 'no-body');

        const { body } = await patchPreference(
          user,
          'NEW_OPENINGS',
          sent,
        ).expect(400);

        expect(body.error).toBe('VALIDATION_ERROR');
      },
    );

    it('returns 400 for a null channel', async () => {
      const user = await registerUser('null');

      const { body } = await patchPreference(user, 'NEW_OPENINGS', {
        inAppEnabled: null,
      }).expect(400);

      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for an unknown category', async () => {
      const user = await registerUser('unknown');

      await patchPreference(user, 'UNKNOWN', { inAppEnabled: false }).expect(
        400,
      );

      expect(
        await prisma.notificationPreference.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });
  });
});
