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
  type RegisteredUser,
} from '../utils/auth';

describe('Media & Cloudinary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const createdUserIds: string[] = [];
  let user: RegisteredUser;

  const registerUser = async (suffix: string) => {
    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-media-${suffix}-${Date.now()}@test.com`,
      firstName: 'Media',
      lastName: 'Tester',
    });
    createdUserIds.push(registered.id);
    return registered;
  };

  const getSignature = (token?: string) => {
    let req = request(app.getHttpServer()).post(
      `${apiPrefix}/media/avatar/signature`,
    );
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    return req;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;

    await app.init();
    prisma = app.get(PrismaService);
    wireNotificationMock();

    user = await registerUser('primary');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await app.close();
  });

  describe('POST /media/avatar/signature', () => {
    it('returns 401 without a token', async () => {
      await getSignature().expect(401);
    });

    it('returns a valid Cloudinary signature payload for the authenticated user', async () => {
      const response = await getSignature(user.accessToken).expect(201);

      // 1. Check for the required Cloudinary fields
      expect(response.body).toEqual(
        expect.objectContaining({
          cloudName: expect.any(String),
          apiKey: expect.any(String),
          timestamp: expect.any(Number),
          signature: expect.any(String),
          folder: `avatars/${user.id}`, // Locks the upload to this user
          uploadPreset: expect.any(String),
        }),
      );

      // 2. Ensure it's a valid 40-char SHA-1 hex string (Cloudinary's signature format)
      expect(response.body.signature).toMatch(/^[0-9a-f]{40}$/);
    });

    it('never leaks the API secret', async () => {
      const response = await getSignature(user.accessToken).expect(201);

      // The secret should never appear in the JSON response
      const responseString = JSON.stringify(response.body);
      const config =
        app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
      const secret = config.get('CLOUDINARY_API_SECRET', { infer: true });

      if (secret) {
        expect(responseString).not.toContain(secret);
      }

      expect(response.body).not.toHaveProperty('apiSecret');
      expect(response.body).not.toHaveProperty('CLOUDINARY_API_SECRET');
    });

    it('issues a different folder for a different user', async () => {
      const otherUser = await registerUser('other');

      const responseA = await getSignature(user.accessToken).expect(201);
      const responseB = await getSignature(otherUser.accessToken).expect(201);

      expect(responseA.body.folder).toBe(`avatars/${user.id}`);
      expect(responseB.body.folder).toBe(`avatars/${otherUser.id}`);
      expect(responseA.body.folder).not.toBe(responseB.body.folder);
    });
  });
});
