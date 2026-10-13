// test/utils/auth.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const capturedOtps = new Map<string, string>();
export const notificationMock = { send: jest.fn() };

export const wireNotificationMock = () => {
  notificationMock.send.mockImplementation(
    async (email: string, template: string, data: Record<string, unknown>) => {
      if (
        template === 'email-verification-otp' &&
        typeof data.otp === 'string'
      ) {
        capturedOtps.set(email, data.otp);
      }
    },
  );
};

export const waitForOtp = async (email: string, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const otp = capturedOtps.get(email);
    if (otp) return otp;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`No OTP captured for ${email}`);
};

export interface RegisteredUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  cookies?: string[];
}

export const registerAndVerify = async (
  app: INestApplication,
  apiPrefix: string,
  options: {
    email?: string;
    password?: string;
    fullName?: string;
    platform?: 'web' | 'mobile';
  } = {},
): Promise<RegisteredUser> => {
  const email = options.email ?? `e2e-${Date.now()}@test.com`;
  const password = options.password ?? 'Password123!';
  const fullName = options.fullName ?? 'Ada Obi';
  const platform = options.platform ?? 'web';

  await request(app.getHttpServer())
    .post(`${apiPrefix}/auth/register`)
    .send({ email, password, fullName })
    .expect(201);

  const otp = await waitForOtp(email);

  let req = request(app.getHttpServer())
    .post(`${apiPrefix}/auth/verify-email`)
    .send({ email, otp });

  if (platform === 'mobile') {
    req = req.set('X-Client-Platform', 'mobile');
  }

  const verify = await req.expect(200);

  return {
    id: verify.body.user.id,
    email,
    accessToken: verify.body.accessToken,
    refreshToken: verify.body.refreshToken,
    cookies: verify.headers['set-cookie'],
  };
};
