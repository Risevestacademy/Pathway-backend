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

const lastResetOtp = (): string => {
  const calls = notificationMock.send.mock.calls;
  const last = calls[calls.length - 1];
  return (last[2] as { otp: string }).otp;
};

const waitForSendCount = async (n: number, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (notificationMock.send.mock.calls.length >= n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(
    `Expected ${n} sends, got ${notificationMock.send.mock.calls.length}`,
  );
};

describe('Password reset OTP request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let userId: string;
  let email: string;

  const requestUrl = () => `${apiPrefix}/auth/password-reset/mobile/request`;

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

    await app.init();
    prisma = app.get(PrismaService);
    wireNotificationMock();

    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-reset-otp-request-${Date.now()}@test.com`,
    });
    userId = registered.id;
    email = registered.email;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
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

  it('emails a six-digit code and stores only the code hash', async () => {
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email: email.toUpperCase() })
      .expect(204);

    await waitForSendCount(1);
    const call = notificationMock.send.mock.calls[0];

    expect(call[2]).toEqual(expect.objectContaining({ expiresInMinutes: 15 }));

    const otp = (call[2] as { otp: string }).otp;
    expect(otp).toMatch(/^\d{6}$/);

    const stored = await prisma.passwordResetOtp.findMany({
      where: { userId, consumedAt: null },
    });

    expect(stored).toHaveLength(1);
    expect(stored[0].codeHash).toBe(hashOf(otp));
    expect(stored[0].codeHash).not.toBe(otp);
    expect(stored[0].attempts).toBe(0);
  });

  it('consumes the previous code when a new one is requested', async () => {
    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);
    await waitForSendCount(1);
    const firstOtp = lastResetOtp();

    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);
    await waitForSendCount(2);
    const secondOtp = lastResetOtp();

    expect(secondOtp).not.toBe(firstOtp);

    // The first code is now rejected; the second succeeds.
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/mobile/confirm`)
      .send({ email, otp: firstOtp, newPassword: 'NewPassword456!' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/mobile/confirm`)
      .send({ email, otp: secondOtp, newPassword: 'NewPassword456!' })
      .expect(204);
  });

  it('does not affect the web link flow for the same user', async () => {
    const beforeOtp = await prisma.passwordResetOtp.count({
      where: { userId, consumedAt: null },
    });
    const beforeLink = await prisma.passwordResetToken.count({
      where: { userId, usedAt: null },
    });

    await request(app.getHttpServer())
      .post(requestUrl())
      .send({ email })
      .expect(204);

    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/password-reset/request`)
      .send({ email })
      .expect(204);

    const afterOtp = await prisma.passwordResetOtp.count({
      where: { userId, consumedAt: null },
    });
    const afterLink = await prisma.passwordResetToken.count({
      where: { userId, usedAt: null },
    });

    // The OTP flow supersedes any live OTP → still exactly one live row.
    expect(afterOtp).toBe(1);
    // The web link flow supersedes any live link → still exactly one live row.
    expect(afterLink).toBe(1);

    // Sanity: whatever the prior test left behind, it's now cleaned up.
    // Only one OTP per user and one link per user can be live at a time.
    expect(beforeOtp).toBeLessThanOrEqual(afterOtp + 1);
    expect(beforeLink).toBeLessThanOrEqual(afterLink + 1);
  });
});
