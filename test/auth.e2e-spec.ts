import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import cookieParser from 'cookie-parser';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  let accessToken: string;
  let refreshToken: string;
  let oldRefreshToken: string;

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

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/register (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.data).toBeDefined();
    expect(response.body.data.email).toBe(testUser.email);

    // Password hash should never be returned to the client.
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(response.body.data.password).toBeUndefined();
  });

  it('/auth/register (POST) - duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect(409);
  });

  it('/auth/login (POST) - wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword!',
      })
      .expect(401);
  });

  it('/auth/login (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(testUser)
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.accessToken).toBeDefined();

    accessToken = response.body.data.accessToken;

    // Refresh token is returned as an HttpOnly cookie for web clients.
    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(refreshCookie).toBeDefined();

    oldRefreshToken = refreshCookie!.split(';')[0].replace('refreshToken=', '');
  });

  it('/auth/me (GET) - authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.email).toBe(testUser.email);
  });

  it('/auth/me (GET) - no access token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/refresh (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${oldRefreshToken}`])
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.accessToken).toBeDefined();

    const cookies = response.headers['set-cookie'];

    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((cookie: string) =>
      cookie.startsWith('refreshToken='),
    );

    expect(refreshCookie).toBeDefined();

    refreshToken = refreshCookie!.split(';')[0].replace('refreshToken=', '');

    // Refresh token rotation should produce a different token.
    expect(refreshToken).not.toBe(oldRefreshToken);

    accessToken = response.body.data.accessToken;
  });

  it('/auth/refresh (POST) - old refresh token is rejected', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${oldRefreshToken}`])
      .expect(401);
  });

  it('/auth/refresh (POST) - new refresh token works', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.accessToken).toBeDefined();

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
    accessToken = response.body.data.accessToken;
  });

  it('/auth/logout (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.message).toBe('Logged out successfully');
  });

  it('/auth/refresh (POST) - rejected after logout', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(401);
  });
});
