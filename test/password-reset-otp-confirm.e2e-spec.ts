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

describe('Password reset OTP confirm (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const oldPassword = 'Password123!';
  const newPassword = 'NewPassword456!';

  const requestUrl = () => `${apiPrefix}/auth/password-reset/mobile/request`;
  const confirmUrl = () => `${apiPrefix}/auth/password-reset/mobile/confirm`;

  const hashOf = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  const lastResetOtp = (): string => {
    const calls = notificationMock.send.mock.calls;
    const last = calls[calls.length - 1];
    return (last[2] as { otp: string }).otp;
  };

  /** Registers a verified user and returns their id, email, and password. */
  const setUpUser = async (label: string) => {
    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-reset-otp-confirm-${label}-${Date.now()}@test.com`,
      password: oldPassword,
    });
    return registered;
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

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    apiPrefix = `/${resolveApiPrefix(config)}`;

    await app.init();
    prisma = app.get(PrismaService);
    wireNotificationMock();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    notificationMock.send.mockClear();
  });

  it('rejects a garbage code', async () => {
    const user = await setUpUser('garbage');

    const response = await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp: '000000', newPassword })
      .expect(400);

    expect(response.body.message).toBe('Invalid or expired reset token');
  });

  it('rejects a malformed OTP in the standard validation format', async () => {
    const user = await setUpUser('malformed');

    const response = await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp: 'abc', newPassword })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty('otp');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const user = await setUpUser('short-pw');
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: user.email })
      .expect(204);
    const otp = lastResetOtp();

    const response = await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp, newPassword: 'short' })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty('newPassword');
  });

  it('rejects an expired code', async () => {
    const user = await setUpUser('expired');
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: user.email })
      .expect(204);
    const otp = lastResetOtp();

    await prisma.passwordResetOtp.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp, newPassword })
      .expect(400);
  });

  it('resets the password, verifies the account, and revokes sessions', async () => {
    // Register *without* verifying, so we can prove confirm auto-verifies.
    const email = `e2e-reset-otp-confirm-flow-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/register`)
      .send({ email, password: oldPassword, fullName: 'Ada Obi' })
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeNull();

    // Give the user a live refresh token so we can watch it get revoked.
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOf('fake-session'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);
    const otp = lastResetOtp();

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email, otp, newPassword })
      .expect(204);

    const updated = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(updated.emailVerifiedAt).not.toBeNull();

    const live = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(live).toBe(0);

    // New password works, old password doesn't.
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password: oldPassword })
      .expect(401);
  });

  it('rejects the same code a second time', async () => {
    const user = await setUpUser('reuse');
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: user.email })
      .expect(204);
    const otp = lastResetOtp();

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp, newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp, newPassword: 'AnotherPassword789!' })
      .expect(400);
  });

  it('locks the code after five wrong attempts, rejecting even the correct one', async () => {
    const user = await setUpUser('lockout');
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: user.email })
      .expect(204);

    const correctOtp = lastResetOtp();
    const wrongOtp = correctOtp === '000000' ? '000001' : '000000';

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(confirmUrl())
        .send({ email: user.email, otp: wrongOtp, newPassword })
        .expect(400);
    }

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp: correctOtp, newPassword })
      .expect(400);

    // The password still hasn't changed.
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email: user.email, password: oldPassword })
      .expect(200);
  });

  it('does not reveal whether the email exists', async () => {
    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({
        email: `nobody-${Date.now()}@test.com`,
        otp: '123456',
        newPassword,
      })
      .expect(400);
  });

  it('leaves a web reset link untouched', async () => {
    const user = await setUpUser('isolated');

    // Create a web reset link and an OTP.
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/request`)
      .send({ email: user.email })
      .expect(204);

    const linkRow = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
    });

    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: user.email })
      .expect(204);
    const otp = lastResetOtp();

    // Complete the OTP reset.
    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ email: user.email, otp, newPassword })
      .expect(204);

    // The web link row is still unused (though its user's password has
    // changed, which is fine — the web flow will just be a no-op write
    // if the user later uses it).
    const linkAfter = await prisma.passwordResetToken.findUnique({
      where: { id: linkRow.id },
    });
    expect(linkAfter?.usedAt).toBeNull();
  });
});
