import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import { AppModule } from '../src/app.module';
import { createValidationPipe } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  let accessToken: string;
  let refreshToken: string;
  let oldRefreshToken: string;

  let apiPrefix: string;

  const testUser = {
    email: `e2e-${Date.now()}@test.com`,
    password: 'Password123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

    const apiVersion = config.get('API_VERSION', { infer: true });

    apiPrefix = `/api/${apiVersion}`;

    app.setGlobalPrefix(apiPrefix);

    app.useGlobalPipes(createValidationPipe());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/register (POST) - success (web client)', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/register`)
      .send(testUser)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.data).toBeUndefined();

    // Verify token & user structure
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(testUser.email);
    expect(response.body.user.id).toBeDefined();
    expect(response.body.user.role).toBeDefined();

    // Password hash should never be returned to the client
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.password).toBeUndefined();

    // Web client receives HttpOnly refresh token cookie on registration
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain(`Path=${apiPrefix}/auth`);
  });

  it('/auth/register (POST) - duplicate email', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/register`)
      .send(testUser)
      .expect(409);
  });

  it('/auth/login (POST) - wrong password', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({
        email: testUser.email,
        password: 'WrongPassword!',
      })
      .expect(401);
  });

  it('/auth/login (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send(testUser)
      .expect(200);

    expect(response.body.data).toBeUndefined();
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(testUser.email);

    accessToken = response.body.accessToken;

    // Refresh token is returned as an HttpOnly cookie for web clients.
    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain(`Path=${apiPrefix}/auth`);

    oldRefreshToken = refreshCookie!.split(';')[0].replace('refreshToken=', '');
  });

  it('/auth/me (GET) - authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get(`${apiPrefix}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toBeUndefined();
    expect(response.body.email).toBe(testUser.email);
  });

  it('/auth/me (GET) - no access token', async () => {
    await request(app.getHttpServer()).get(`${apiPrefix}/auth/me`).expect(401);
  });

  it('/auth/refresh (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/refresh`)
      .set('Cookie', [`refreshToken=${oldRefreshToken}`])
      .expect(200);

    expect(response.body.data).toBeUndefined();
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeUndefined();

    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain(`Path=${apiPrefix}/auth`);

    refreshToken = refreshCookie!.split(';')[0].replace('refreshToken=', '');

    // Refresh token rotation should produce a different token.
    expect(refreshToken).not.toBe(oldRefreshToken);

    accessToken = response.body.accessToken;
  });

  it('/auth/refresh (POST) - old refresh token is rejected', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/refresh`)
      .set('Cookie', [`refreshToken=${oldRefreshToken}`])
      .expect(401);
  });

  it('/auth/refresh (POST) - new refresh token works', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/refresh`)
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(200);

    expect(response.body.data).toBeUndefined();
    expect(response.body.accessToken).toBeDefined();

    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const nextRefreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(nextRefreshCookie).toBeDefined();

    const nextRefreshToken = nextRefreshCookie!
      .split(';')[0]
      .replace('refreshToken=', '');

    expect(nextRefreshToken).not.toBe(refreshToken);

    refreshToken = nextRefreshToken;
    accessToken = response.body.accessToken;
  });

  it('/auth/logout (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/logout`)
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(204);

    expect(response.body).toEqual({});
    expect(response.text).toBe('');

    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const clearedCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toContain(`Path=${apiPrefix}/auth`);
  });

  it('/auth/refresh (POST) - rejected after logout', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/refresh`)
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(401);
  });

  it('/auth/logout (POST) - without a refresh token', async () => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/logout`)
      .expect(204);

    expect(response.text).toBe('');
  });

  it('/auth/logout (POST) - tolerates an unusable refresh token', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/logout`)
      .send({ refreshToken: 'not-a-jwt' })
      .expect(204);
  });

  it('/auth/logout (POST) - tolerates an unsupported platform header', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/logout`)
      .set('X-Client-Platform', 'desktop')
      .expect(204);
  });

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
        .send(mobileUser)
        .expect(201);

      expect(regResponse.body.accessToken).toBeDefined();
      expect(regResponse.body.refreshToken).toBeDefined();
      expect(regResponse.body.user).toBeDefined();
      expect(regResponse.headers['set-cookie']).toBeUndefined();

      const loginResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .set('X-Client-Platform', 'mobile')
        .send(mobileUser)
        .expect(200);

      expect(loginResponse.body.user).toBeDefined();
      mobileRefreshToken = loginResponse.body.refreshToken;
    });

    it('logs in without a refresh cookie', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .set('X-Client-Platform', 'mobile')
        .send(mobileUser)
        .expect(200);

      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('refreshes from the request body', async () => {
      const response = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: mobileRefreshToken })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
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

    it('revokes the body token on logout even when a cookie is attached', async () => {
      const web = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send(mobileUser)
        .expect(200);

      const cookie = (web.headers['set-cookie'] as unknown as string[]).find(
        (entry) => entry.startsWith('refreshToken='),
      )!;

      const cookieToken = cookie.split(';')[0].replace('refreshToken=', '');

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/logout`)
        .set('X-Client-Platform', 'mobile')
        .set('Cookie', [`refreshToken=${cookieToken}`])
        .send({ refreshToken: mobileRefreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: mobileRefreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('Cookie', [`refreshToken=${cookieToken}`])
        .expect(401);
    });
  });
});
