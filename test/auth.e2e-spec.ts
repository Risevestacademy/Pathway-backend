import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { PrismaService } from '../src/prisma';
import { AuthService } from '../src/auth/auth.service';
import { NotificationService } from '../src/notifications';
import { AuthProvider } from '../src/generated/prisma/enums';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  let accessToken: string;
  let refreshToken: string;
  let oldRefreshToken: string;

  let apiPrefix: string;
  let prisma: PrismaService;
  let registeredUser: Record<string, unknown>;
  let authService: AuthService;

  const capturedOtps = new Map<string, string>();
  const capturedResets = new Map<string, string>();
  const realNotificationService = { send: jest.fn() };

  const userKeys = [
    'createdAt',
    'email',
    'emailVerified',
    'fullName',
    'id',
    'role',
  ];

  const testUser = {
    email: `e2e-${Date.now()}@test.com`,
    password: 'Password123!',
  };

  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`${apiPrefix}/auth/register`).send(body);

  const verifyEmail = (body: { email: string; otp: string }) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/auth/verify-email`)
      .send(body);

  const login = (body: { email: string; password: string }) =>
    request(app.getHttpServer()).post(`${apiPrefix}/auth/login`).send(body);

  const registerAndVerify = async (
    email: string,
    password: string,
    fullName = 'Ada Obi',
  ) => {
    await register({ email, password, fullName }).expect(201);

    const otp = capturedOtps.get(email);
    if (!otp) throw new Error(`No OTP captured for ${email}`);

    return verifyEmail({ email, otp }).expect(200);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(realNotificationService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

    apiPrefix = `/${resolveApiPrefix(config)}`;
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    realNotificationService.send.mockImplementation(
      async (
        email: string,
        template: string,
        data: Record<string, unknown>,
      ) => {
        if (
          template === 'email-verification-otp' &&
          typeof data.otp === 'string'
        ) {
          capturedOtps.set(email, data.otp);
        }
        if (
          template === 'password-reset' &&
          typeof data.resetUrl === 'string'
        ) {
          const url = new URL(data.resetUrl);
          const token = url.searchParams.get('token');
          if (token) capturedResets.set(email, token);
        }
      },
    );

    await app.init();
  });

  beforeEach(() => {
    realNotificationService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────
  // /auth/register
  // ──────────────────────────────────────────────────────────────
  describe('/auth/register (POST)', () => {
    it('creates an unverified user and returns an acknowledgement without tokens', async () => {
      const email = `e2e-register-${Date.now()}@test.com`;
      const response = await register({
        email,
        password: 'Password123!',
        fullName: '  Ada Obi  ',
      }).expect(201);

      expect(response.body).toEqual({
        message: 'Verification code sent',
        email,
      });
      expect(response.body.accessToken).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(capturedOtps.get(email)).toMatch(/^\d{6}$/);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).toBeNull();

      const profile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
      });
      expect(profile?.fullName).toBe('Ada Obi');
    });

    it('normalizes the email to lowercase', async () => {
      const email = `E2E-CASE-${Date.now()}@TEST.COM`;
      await register({ email, password: 'Password123!', fullName: 'A' }).expect(
        201,
      );

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: email.toLowerCase() },
      });
      expect(user.email).toBe(email.toLowerCase());
    });

    it('rejects a duplicate email', async () => {
      const email = `e2e-dup-${Date.now()}@test.com`;
      await register({ email, password: 'Password123!', fullName: 'A' }).expect(
        201,
      );
      await register({ email, password: 'Password123!', fullName: 'B' }).expect(
        409,
      );
    });

    it('rejects registering an email that already exists as a Google account', async () => {
      const email = `e2e-google-dup-${Date.now()}@test.com`;
      await prisma.user.create({
        data: {
          email,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          profile: { create: { fullName: 'Google User' } },
          identities: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerUserId: `google-${Date.now()}`,
            },
          },
        },
      });

      await register({ email, password: 'Password123!', fullName: 'A' }).expect(
        409,
      );
    });

    it.each([
      ['missing', {}],
      ['blank', { fullName: '   ' }],
      ['over 100 characters', { fullName: 'a'.repeat(101) }],
      ['not a string', { fullName: 42 }],
    ])(
      'rejects a %s fullName in the standard validation format',
      async (_label, body) => {
        const response = await register({
          email: `e2e-invalid-name-${Date.now()}@test.com`,
          password: 'Password123!',
          ...body,
        }).expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.fields).toHaveProperty('fullName');
      },
    );
  });

  // ──────────────────────────────────────────────────────────────
  // /auth/verify-email
  // ──────────────────────────────────────────────────────────────
  describe('/auth/verify-email (POST)', () => {
    it('verifies with the correct OTP and returns tokens for a web client', async () => {
      const email = `e2e-verify-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const otp = capturedOtps.get(email)!;
      const response = await verifyEmail({ email, otp }).expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeUndefined();
      expect(response.body.user.email).toBe(email);
      expect(response.body.user.emailVerified).toBe(true);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(
        cookies.find((c: string) => c.startsWith('refreshToken=')),
      ).toContain(`Path=${apiPrefix}/auth`);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('returns tokens in the body for a mobile client', async () => {
      const email = `e2e-verify-mobile-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const otp = capturedOtps.get(email)!;
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/verify-email`)
        .set('X-Client-Platform', 'mobile')
        .send({ email, otp })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a wrong OTP with 400', async () => {
      const email = `e2e-verify-wrong-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const realOtp = capturedOtps.get(email)!;
      const wrongOtp = realOtp === '000000' ? '000001' : '000000';

      await verifyEmail({ email, otp: wrongOtp }).expect(400);
    });

    it('rejects a reused OTP with 400', async () => {
      const email = `e2e-verify-reuse-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const otp = capturedOtps.get(email)!;
      await verifyEmail({ email, otp }).expect(200);
      await verifyEmail({ email, otp }).expect(400);
    });

    it('rejects an expired OTP', async () => {
      const email = `e2e-verify-expired-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const otp = capturedOtps.get(email)!;

      // Force-expire the OTP row.
      await prisma.emailVerificationOtp.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await verifyEmail({ email, otp }).expect(400);
    });

    it('rejects verification for an already-verified user', async () => {
      const email = `e2e-verify-already-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      // Grab the (now consumed) OTP from the map, or just send any code.
      await verifyEmail({
        email,
        otp: capturedOtps.get(email) ?? '123456',
      }).expect(400);
    });

    it('does not reveal whether the email exists', async () => {
      await verifyEmail({
        email: `no-such-user-${Date.now()}@test.com`,
        otp: '123456',
      }).expect(400);
    });

    it('rejects a malformed OTP in the standard validation format', async () => {
      const response = await verifyEmail({
        email: testUser.email,
        otp: 'abc',
      }).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('otp');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // /auth/resend-verification
  // ──────────────────────────────────────────────────────────────
  describe('/auth/resend-verification (POST)', () => {
    it('issues a fresh code and invalidates the previous one', async () => {
      const email = `e2e-resend-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const firstOtp = capturedOtps.get(email)!;

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/resend-verification`)
        .send({ email })
        .expect(204);

      const secondOtp = capturedOtps.get(email)!;

      await verifyEmail({ email, otp: firstOtp }).expect(400);
      await verifyEmail({ email, otp: secondOtp }).expect(200);
    });

    it('always returns 204 for an unknown email', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/resend-verification`)
        .send({ email: `nobody-${Date.now()}@test.com` })
        .expect(204);
    });

    it('always returns 204 for an already-verified email', async () => {
      const email = `e2e-resend-verified-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/resend-verification`)
        .send({ email })
        .expect(204);
    });

    it('does not issue a new OTP for an already-verified email', async () => {
      const email = `e2e-resend-verified-2-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      const before = await prisma.emailVerificationOtp.count({
        where: { user: { email } },
      });

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/resend-verification`)
        .send({ email })
        .expect(204);

      const after = await prisma.emailVerificationOtp.count({
        where: { user: { email } },
      });

      expect(after).toBe(before);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // /auth/login
  // ──────────────────────────────────────────────────────────────
  describe('/auth/login (POST)', () => {
    it('rejects an unverified account with 401 "Email not verified"', async () => {
      const email = `e2e-unverified-${Date.now()}@test.com`;
      await register({
        email,
        password: 'Password123!',
        fullName: 'Ada Obi',
      }).expect(201);

      const response = await login({
        email,
        password: 'Password123!',
      }).expect(401);

      expect(response.body.message).toBe('Email not verified');
    });

    it('logs in a verified account', async () => {
      const email = `e2e-login-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      const response = await login({
        email,
        password: 'Password123!',
      }).expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.email).toBe(email);
    });

    it('accepts the email in a different case', async () => {
      const email = `e2e-login-case-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      const response = await login({
        email: email.toUpperCase(),
        password: 'Password123!',
      }).expect(200);

      expect(response.body.user.email).toBe(email);
    });

    it('rejects a wrong password with 401', async () => {
      const email = `e2e-login-wrong-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await login({ email, password: 'WrongPassword!' }).expect(401);
    });

    it('rejects login for a Google-only account with no password set', async () => {
      const email = `e2e-google-only-${Date.now()}@test.com`;
      await prisma.user.create({
        data: {
          email,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          profile: { create: { fullName: 'Google Only' } },
          identities: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerUserId: `google-${Date.now()}`,
            },
          },
        },
      });

      await login({ email, password: 'Password123!' }).expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // /auth/password-reset/*
  // ──────────────────────────────────────────────────────────────
  describe('/auth/password-reset (POST)', () => {
    it('request: always returns 204 for an unknown email (no enumeration)', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email: `nobody-${Date.now()}@test.com` })
        .expect(204);
    });

    it('request: returns 204 and emails a reset link for a known email', async () => {
      const email = `e2e-pwreset-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      expect(capturedResets.get(email)).toBeDefined();
    });

    it('request: rejects a malformed email with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('email');
    });

    it('confirm: updates the password, auto-verifies, and revokes sessions', async () => {
      const email = `e2e-pwreset-confirm-${Date.now()}@test.com`;
      const oldPassword = 'Password123!';
      const newPassword = 'NewPassword456!';

      // Register but DO NOT verify — password reset should auto-verify.
      await register({
        email,
        password: oldPassword,
        fullName: 'Ada Obi',
      }).expect(201);

      // Issue a refresh token by logging in via a reset-free path? No —
      // the user is unverified so login would fail. Instead, create a
      // session directly.
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const sessionTokenHash = sha256('fake-session');
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: sessionTokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Request a reset.
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      const token = capturedResets.get(email)!;

      // Confirm the reset.
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token, newPassword })
        .expect(204);

      // User is now verified and has the new password.
      const updated = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(updated.emailVerifiedAt).not.toBeNull();

      // Old sessions revoked.
      const live = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(live).toBe(0);

      // Login with the new password works.
      await login({ email, password: newPassword }).expect(200);

      // Login with the old password fails.
      await login({ email, password: oldPassword }).expect(401);
    });

    it('confirm: rejects a reused token', async () => {
      const email = `e2e-pwreset-reuse-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      const token = capturedResets.get(email)!;

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token, newPassword: 'NewPassword456!' })
        .expect(204);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token, newPassword: 'AnotherPassword789!' })
        .expect(400);
    });

    it('confirm: rejects an expired token', async () => {
      const email = `e2e-pwreset-expired-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      await prisma.passwordResetToken.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const token = capturedResets.get(email)!;

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token, newPassword: 'NewPassword456!' })
        .expect(400);
    });

    it('confirm: rejects a garbage token', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token: 'not-a-real-token', newPassword: 'Password123!' })
        .expect(400);
    });

    it('request: a new request invalidates the previous token', async () => {
      const email = `e2e-pwreset-supersede-${Date.now()}@test.com`;
      await registerAndVerify(email, 'Password123!');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      const firstToken = capturedResets.get(email)!;

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/request`)
        .send({ email })
        .expect(204);

      const secondToken = capturedResets.get(email)!;

      expect(secondToken).not.toBe(firstToken);

      // The first token must no longer work.
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token: firstToken, newPassword: 'NewPassword456!' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/password-reset/confirm`)
        .send({ token: secondToken, newPassword: 'NewPassword456!' })
        .expect(204);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Authenticated session
  // ──────────────────────────────────────────────────────────────
  describe('authenticated session', () => {
    beforeAll(async () => {
      const email = testUser.email;
      const response = await registerAndVerify(email, testUser.password);

      accessToken = response.body.accessToken;
      registeredUser = response.body.user;

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='))!;
      oldRefreshToken = refreshCookie
        .split(';')[0]
        .replace('refreshToken=', '');
    });

    it('/auth/me (GET) - authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual(registeredUser);
      expect(Object.keys(response.body).sort()).toEqual(userKeys);
    });

    it('/auth/me (GET) - no access token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/auth/me`)
        .expect(401);
    });

    it('/auth/me (GET) - garbage access token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/auth/me`)
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('/auth/me (GET) - access token for a deleted user', async () => {
      const email = `e2e-me-deleted-${Date.now()}@test.com`;
      const response = await registerAndVerify(email, 'Password123!');
      const token = response.body.accessToken;

      await prisma.user.delete({ where: { email } });

      await request(app.getHttpServer())
        .get(`${apiPrefix}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('/auth/refresh (POST) - rotates the refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('Cookie', [`refreshToken=${oldRefreshToken}`])
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeUndefined();

      const cookies = response.headers['set-cookie'];
      const refreshCookie = cookies.find((c: string) =>
        c.startsWith('refreshToken='),
      );
      refreshToken = refreshCookie.split(';')[0].replace('refreshToken=', '');

      expect(refreshToken).not.toBe(oldRefreshToken);
      accessToken = response.body.accessToken;
    });

    it('/auth/refresh (POST) - old token is rejected', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('Cookie', [`refreshToken=${oldRefreshToken}`])
        .expect(401);
    });

    it('/auth/refresh (POST) - garbage token is rejected', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('Cookie', ['refreshToken=not-a-real-jwt'])
        .expect(401);
    });

    it('/auth/refresh (POST) - missing cookie is rejected', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .expect(401);
    });

    it('/auth/logout (POST) - clears the cookie and revokes the token', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/logout`)
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .expect(204);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .expect(401);
    });

    it('/auth/logout (POST) - is idempotent for an unknown token', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/logout`)
        .set('Cookie', ['refreshToken=not-a-real-jwt'])
        .expect(204);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Google login
  // ──────────────────────────────────────────────────────────────
  describe('/auth/google (POST)', () => {
    it('authenticates with Google successfully and sets a refresh cookie for web clients', async () => {
      jest.spyOn(authService, 'googleLogin').mockResolvedValueOnce({
        user: registeredUser as never,
        tokens: {
          accessToken: 'google-access-token',
          refreshToken: 'google-refresh-token',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/google`)
        .send({ idToken: 'valid-google-id-token' })
        .expect(200);

      expect(response.body.accessToken).toBe('google-access-token');
      expect(response.body.user).toBeDefined();

      const refreshCookie = (
        response.headers['set-cookie'] as unknown as string[]
      ).find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toContain(`Path=${apiPrefix}/auth`);
    });

    it('returns tokens in the body for mobile clients', async () => {
      jest.spyOn(authService, 'googleLogin').mockResolvedValueOnce({
        user: registeredUser as never,
        tokens: {
          accessToken: 'google-access-token',
          refreshToken: 'google-refresh-token',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/google`)
        .set('X-Client-Platform', 'mobile')
        .send({ idToken: 'valid-google-id-token' })
        .expect(200);

      expect(response.body.accessToken).toBe('google-access-token');
      expect(response.body.refreshToken).toBe('google-refresh-token');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects an invalid google id token', async () => {
      jest
        .spyOn(authService, 'googleLogin')
        .mockRejectedValueOnce(
          new UnauthorizedException('Google ID token is invalid'),
        );

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/google`)
        .send({ idToken: 'invalid-token' })
        .expect(401);
    });

    it('rejects a missing idToken with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/google`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('idToken');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Mobile clients
  // ──────────────────────────────────────────────────────────────
  describe('mobile clients', () => {
    const mobileUser = {
      email: `e2e-mobile-${Date.now()}@test.com`,
      password: 'Password123!',
    };

    let mobileRefreshToken: string;

    beforeAll(async () => {
      const regResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/register`)
        .set('X-Client-Platform', 'mobile')
        .send({ ...mobileUser, fullName: 'Mobile User' })
        .expect(201);

      expect(regResponse.body.accessToken).toBeUndefined();
      expect(regResponse.body.refreshToken).toBeUndefined();

      const otp = capturedOtps.get(mobileUser.email)!;

      const verifyResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/verify-email`)
        .set('X-Client-Platform', 'mobile')
        .send({ email: mobileUser.email, otp })
        .expect(200);

      expect(verifyResponse.body.accessToken).toBeDefined();
      expect(verifyResponse.body.refreshToken).toBeDefined();
      expect(verifyResponse.headers['set-cookie']).toBeUndefined();

      mobileRefreshToken = verifyResponse.body.refreshToken;
    });

    it('logs in without a refresh cookie', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .set('X-Client-Platform', 'mobile')
        .send(mobileUser)
        .expect(200);

      expect(response.body.refreshToken).toBeDefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('refreshes from the request body', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: mobileRefreshToken })
        .expect(200);

      expect(response.body.refreshToken).not.toBe(mobileRefreshToken);
      mobileRefreshToken = response.body.refreshToken;
    });

    it('does not accept a cookie when the platform is mobile', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .set('Cookie', [`refreshToken=${mobileRefreshToken}`])
        .expect(401);
    });

    it('does not accept a body token when the platform is web', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .send({ refreshToken: mobileRefreshToken })
        .expect(401);
    });

    it('rejects an unknown property in the request body', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: mobileRefreshToken, extra: 'nope' })
        .expect(400);
    });

    it('rejects an unsupported platform', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'desktop')
        .send({ refreshToken: mobileRefreshToken })
        .expect(400);
    });

    it('logout via body revokes the mobile refresh token', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .set('X-Client-Platform', 'mobile')
        .send(mobileUser)
        .expect(200);

      const tokenToRevoke = loginResponse.body.refreshToken;

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/logout`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: tokenToRevoke })
        .expect(204);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: tokenToRevoke })
        .expect(401);
    });
  });
});
