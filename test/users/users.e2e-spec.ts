import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let userId: string;
  let accessToken: string;
  let otherUserId: string;

  const password = 'Password123!';

  const patchMe = () =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/users/me`)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    apiPrefix = `/${resolveApiPrefix(config)}`;
    prisma = app.get(PrismaService);

    await app.init();
    wireNotificationMock();

    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-profile-${Date.now()}@test.com`,
      password,
      firstName: 'Ada',
      lastName: 'Obi',
    });
    userId = registered.id;
    accessToken = registered.accessToken;

    const other = await registerAndVerify(app, apiPrefix, {
      email: `e2e-profile-other-${Date.now()}@test.com`,
      password,
      firstName: 'Ada',
      lastName: 'Obi',
    });
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await app.close();
  });

  it('creates a profile for a user without one and returns the shared shape', async () => {
    await prisma.userProfile.deleteMany({ where: { userId } });

    const response = await patchMe()
      .send({ firstName: 'Ada', lastName: 'Obi' })
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'createdAt',
      'email',
      'emailVerified',
      'firstName',
      'fullName',
      'id',
      'lastName',
      'role',
    ]);
    expect(response.body).toMatchObject({
      id: userId,
      firstName: 'Ada',
      lastName: 'Obi',
      fullName: 'Ada Obi',
    });

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    expect(profile).toMatchObject({ firstName: 'Ada', lastName: 'Obi' });
  });

  it('handles concurrent updates for a user without a profile', async () => {
    await prisma.userProfile.deleteMany({ where: { userId } });

    const responses = await Promise.all(
      ['First', 'Second', 'Third'].map((firstName) =>
        patchMe().send({ firstName }),
      ),
    );

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    await expect(prisma.userProfile.count({ where: { userId } })).resolves.toBe(
      1,
    );
  });

  it('updates an existing profile and stores the name trimmed', async () => {
    const response = await patchMe()
      .send({ firstName: '  Grace  ', lastName: '  Hopper  ' })
      .expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Grace',
      lastName: 'Hopper',
      fullName: 'Grace Hopper',
    });

    const me = await request(app.getHttpServer())
      .get(`${apiPrefix}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toEqual(response.body);
  });

  it.each([
    ['missing', {}],
    ['blank', { firstName: '   ' }],
    ['over 100 characters', { firstName: 'a'.repeat(101) }],
    ['not a string', { firstName: 42 }],
  ])(
    'rejects a %s firstName in the standard validation format',
    async (_label, body) => {
      const response = await patchMe().send(body).expect(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('firstName');
    },
  );

  it('accepts a firstName of exactly 100 characters', async () => {
    await patchMe()
      .send({ firstName: 'a'.repeat(100) })
      .expect(200);
  });

  it('rejects a body that tries to choose the user', async () => {
    const response = await patchMe()
      .send({ firstName: 'Mallory', id: otherUserId, userId: otherUserId })
      .expect(400);

    expect(response.body.fields).toHaveProperty('id');
    expect(response.body.fields).toHaveProperty('userId');

    const otherProfile = await prisma.userProfile.findUnique({
      where: { userId: otherUserId },
    });
    expect(otherProfile?.firstName ?? null).not.toBe('Mallory');
  });

  it('returns 401 without an access token', async () => {
    await request(app.getHttpServer())
      .patch(`${apiPrefix}/users/me`)
      .send({ firstName: 'Ada' })
      .expect(401);
  });

  it('does not expose an existing user by id', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/users/${otherUserId}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${apiPrefix}/users/${otherUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
