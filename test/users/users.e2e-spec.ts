import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AnalyticsService } from '../../src/analytics';
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
      'analyticsEnabled',
      'avatarUrl',
      'careerInterests',
      'careerStage',
      'createdAt',
      'educationLevel',
      'email',
      'emailVerified',
      'experienceYears',
      'firstName',
      'fullName',
      'id',
      'internshipCount',
      'lastName',
      'learningGoals',
      'role',
      'weeklyTimeCommitment',
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

  it('keeps the stored names when firstName is omitted', async () => {
    await patchMe().send({ firstName: 'Ada', lastName: 'Obi' }).expect(200);

    const response = await patchMe().send({}).expect(200);

    expect(response.body).toMatchObject({ firstName: 'Ada', lastName: 'Obi' });
  });

  it.each([
    ['null', { firstName: null }],
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

  describe('onboarding and settings fields', () => {
    const avatarUrl = () => {
      const cloudName = app
        .get<ConfigService<EnvironmentVariables, true>>(ConfigService)
        .get('CLOUDINARY_CLOUD_NAME', { infer: true });
      return `https://res.cloudinary.com/${cloudName}/image/upload/v1/avatars/${userId}/photo.jpg`;
    };

    const fullPayload = () => ({
      firstName: 'Ada',
      lastName: 'Obi',
      avatarUrl: avatarUrl(),
      careerStage: 'RECENT_GRAD',
      educationLevel: 'BACHELOR',
      internshipCount: 'ONE',
      experienceYears: 'UNDER_ONE',
      learningGoals: ['Land a first internship', 'Build a portfolio'],
      weeklyTimeCommitment: '5-10 hours a week',
      careerInterests: ['software-engineering', 'design'],
      analyticsEnabled: false,
    });

    afterEach(async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { analyticsEnabled: true },
      });
    });

    it('saves a full payload and returns it', async () => {
      const payload = fullPayload();

      const response = await patchMe().send(payload).expect(200);

      expect(response.body).toMatchObject({
        ...payload,
        fullName: 'Ada Obi',
      });

      const stored = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
      const { analyticsEnabled, ...profileFields } = payload;
      expect(stored?.analyticsEnabled).toBe(analyticsEnabled);
      expect(stored?.profile).toMatchObject(profileFields);
    });

    it('changes only the fields sent', async () => {
      await patchMe().send(fullPayload()).expect(200);

      const response = await patchMe()
        .send({ educationLevel: 'MASTERS' })
        .expect(200);

      expect(response.body).toMatchObject({
        ...fullPayload(),
        educationLevel: 'MASTERS',
      });
    });

    it('clears fields sent as null', async () => {
      await patchMe().send(fullPayload()).expect(200);

      const response = await patchMe()
        .send({
          lastName: null,
          avatarUrl: null,
          careerStage: null,
          educationLevel: null,
          internshipCount: null,
          experienceYears: null,
          learningGoals: null,
          weeklyTimeCommitment: null,
          careerInterests: null,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        firstName: 'Ada',
        lastName: null,
        fullName: 'Ada',
        avatarUrl: null,
        careerStage: null,
        educationLevel: null,
        internshipCount: null,
        experienceYears: null,
        learningGoals: [],
        weeklyTimeCommitment: null,
        careerInterests: [],
      });
    });

    it.each([
      ['an invalid enum', { educationLevel: 'PHD' }, 'educationLevel'],
      ['a null analytics flag', { analyticsEnabled: null }, 'analyticsEnabled'],
      [
        'too many goals',
        { learningGoals: Array.from({ length: 11 }, (_, i) => `Goal ${i}`) },
        'learningGoals',
      ],
      [
        'duplicate interests',
        { careerInterests: ['design', 'design'] },
        'careerInterests',
      ],
    ])('rejects %s with 400 and saves nothing', async (_label, body, field) => {
      const before = await prisma.userProfile.findUnique({
        where: { userId },
      });

      const response = await patchMe()
        .send({ ...body, weeklyTimeCommitment: 'changed' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty(field);
      await expect(
        prisma.userProfile.findUnique({ where: { userId } }),
      ).resolves.toEqual(before);
    });

    it('rejects an unknown field slug with 400 and saves nothing', async () => {
      await patchMe()
        .send({ careerInterests: ['design'] })
        .expect(200);

      const response = await patchMe()
        .send({ careerInterests: ['design', 'astrology'] })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'UNKNOWN_CAREER_INTEREST',
        details: { slugs: ['astrology'] },
      });
      const profile = await prisma.userProfile.findUnique({
        where: { userId },
      });
      expect(profile?.careerInterests).toEqual(['design']);
    });

    it("rejects an avatar URL in another user's folder", async () => {
      const response = await patchMe()
        .send({ avatarUrl: avatarUrl().replace(userId, otherUserId) })
        .expect(400);

      expect(response.body.code).toBe('INVALID_AVATAR_URL');
    });

    describe('analytics opt-out', () => {
      let invalidateUser: jest.SpiedFunction<
        AnalyticsService['invalidateUser']
      >;

      beforeEach(() => {
        invalidateUser = jest.spyOn(
          app.get(AnalyticsService),
          'invalidateUser',
        );
      });

      afterEach(() => {
        invalidateUser.mockRestore();
      });

      it('saves the change and clears the cached flag for the next event', async () => {
        await patchMe().send({ analyticsEnabled: false }).expect(200);

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { analyticsEnabled: true },
        });
        expect(user?.analyticsEnabled).toBe(false);
        expect(invalidateUser).toHaveBeenCalledTimes(1);
        expect(invalidateUser).toHaveBeenCalledWith(userId);
      });

      it('leaves the cache alone when the flag is sent unchanged', async () => {
        await patchMe().send({ analyticsEnabled: true }).expect(200);

        expect(invalidateUser).not.toHaveBeenCalled();
      });
    });
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
