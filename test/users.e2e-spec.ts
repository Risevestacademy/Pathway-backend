import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { PrismaService } from '../src/prisma';

describe('PATCH /users/me (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let userId: string;
  let accessToken: string;
  let otherUserId: string;

  const password = 'Password123!';

  const register = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/register`)
      .send({ email, password })
      .expect(201);

    return response.body as {
      accessToken: string;
      user: { id: string };
    };
  };

  const patchMe = () =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/users/me`)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    apiPrefix = `/${resolveApiPrefix(config)}`;
    prisma = app.get(PrismaService);

    await app.init();

    const registration = await register(`e2e-profile-${Date.now()}@test.com`);
    userId = registration.user.id;
    accessToken = registration.accessToken;

    const other = await register(`e2e-profile-other-${Date.now()}@test.com`);
    otherUserId = other.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await app.close();
  });

  it('creates a profile for a user without one and returns the shared shape', async () => {
    await prisma.userProfile.deleteMany({ where: { userId } });

    const response = await patchMe().send({ fullName: 'Ada Obi' }).expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'createdAt',
      'email',
      'emailVerified',
      'fullName',
      'id',
      'role',
    ]);
    expect(response.body).toMatchObject({ id: userId, fullName: 'Ada Obi' });

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    expect(profile?.fullName).toBe('Ada Obi');
  });

  it('handles concurrent updates for a user without a profile', async () => {
    await prisma.userProfile.deleteMany({ where: { userId } });

    const responses = await Promise.all(
      ['First', 'Second', 'Third'].map((fullName) =>
        patchMe().send({ fullName }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    await expect(prisma.userProfile.count({ where: { userId } })).resolves.toBe(
      1,
    );
  });

  it('updates an existing profile and stores the name trimmed', async () => {
    const response = await patchMe()
      .send({ fullName: '  Grace Hopper  ' })
      .expect(200);

    expect(response.body.fullName).toBe('Grace Hopper');

    const me = await request(app.getHttpServer())
      .get(`${apiPrefix}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body).toEqual(response.body);
  });

  it.each([
    ['missing', {}],
    ['blank', { fullName: '   ' }],
    ['over 100 characters', { fullName: 'a'.repeat(101) }],
    ['not a string', { fullName: 42 }],
  ])(
    'rejects a %s fullName in the standard validation format',
    async (_label, body) => {
      const response = await patchMe().send(body).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('fullName');
    },
  );

  it('accepts a fullName of exactly 100 characters', async () => {
    await patchMe()
      .send({ fullName: 'a'.repeat(100) })
      .expect(200);
  });

  it('rejects a body that tries to choose the user', async () => {
    const response = await patchMe()
      .send({ fullName: 'Mallory', id: otherUserId, userId: otherUserId })
      .expect(400);

    expect(response.body.fields).toHaveProperty('id');
    expect(response.body.fields).toHaveProperty('userId');

    const otherProfile = await prisma.userProfile.findUnique({
      where: { userId: otherUserId },
    });
    expect(otherProfile?.fullName ?? null).not.toBe('Mallory');
  });

  it('returns 401 without an access token', async () => {
    await request(app.getHttpServer())
      .patch(`${apiPrefix}/users/me`)
      .send({ fullName: 'Ada Obi' })
      .expect(401);
  });
});
