import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Password reset request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let passwordResetUrl: string;

  let userId: string;
  let email: string;

  const requestUrl = () => `${apiPrefix}/auth/password-reset/request`;

  const lastEmailedToken = (): string => {
    const calls = notificationMock.send.mock.calls;
    const { resetUrl } = calls[calls.length - 1][2] as { resetUrl: string };

    return new URL(resetUrl).searchParams.get('token')!;
  };

  const hashOf = (token: string) =>
    createHash('sha256').update(token).digest('hex');

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
    passwordResetUrl = config.get('PASSWORD_RESET_URL', { infer: true });

    await app.init();

    prisma = app.get(PrismaService);

    wireNotificationMock();

    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-reset-request-${Date.now()}@test.com`,
      platform: 'mobile',
    });

    userId = registered.id;
    email = registered.email;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Keep the password-reset send calls isolated per test, but do NOT
    // clear the notification implementation — that's what captures OTPs
    // during any future register in this suite. `clearAllMocks` only
    // wipes call history, so it's safe.
    notificationMock.send.mockClear();
  });

  it('returns 204 for an unknown email without sending anything', async () => {
    const response = await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: 'nobody-registered@test.com' })
      .expect(204);

    expect(response.body).toEqual({});
    expect(notificationMock.send).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty('email');
  });

  it('emails a reset link and stores only the token hash', async () => {
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: email.toUpperCase() })
      .expect(204);

    expect(notificationMock.send).toHaveBeenCalledWith(
      email,
      'password-reset',
      expect.objectContaining({ expiresInMinutes: 60 }),
    );

    const token = lastEmailedToken();
    const { resetUrl } = notificationMock.send.mock.calls[0][2] as {
      resetUrl: string;
    };

    expect(resetUrl).toBe(`${passwordResetUrl}?token=${token}`);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const stored = await prisma.passwordResetToken.findMany({
      where: { userId },
    });

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(hashOf(token));
    expect(stored[0].tokenHash).not.toBe(token);
    expect(stored[0].usedAt).toBeNull();
  });

  it('invalidates the previous link when a new one is requested', async () => {
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);
    const firstToken = lastEmailedToken();

    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);
    const secondToken = lastEmailedToken();

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/confirm`)
      .send({ token: firstToken, newPassword: 'NewPassword456!' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/confirm`)
      .send({ token: secondToken, newPassword: 'NewPassword456!' })
      .expect(204);

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password: 'NewPassword456!' })
      .expect(200);
  });
});
