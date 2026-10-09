import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { PrismaService } from '../src/prisma';

describe('Password reset confirm (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let userId: string;
  let refreshToken: string;

  const oldPassword = 'Password123!';
  const newPassword = 'NewPassword456!';
  const email = `e2e-reset-${Date.now()}@test.com`;

  const confirmUrl = () => `${apiPrefix}/auth/password-reset/confirm`;

  const createResetToken = async (expiresAt: Date): Promise<string> => {
    const token = randomBytes(32).toString('hex');

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
    });

    return token;
  };

  const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    configureApp(app);

    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;

    await app.init();

    prisma = app.get(PrismaService);

    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/register`)
      .set('X-Client-Platform', 'mobile')
      .send({ email, password: oldPassword, fullName: 'Ada Obi' })
      .expect(201);

    userId = response.body.user.id;
    refreshToken = response.body.refreshToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unknown token', async () => {
    const response = await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ token: 'not-a-real-token', newPassword })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'BAD_REQUEST',
        message: 'Invalid or expired reset token',
      }),
    );
  });

  it('rejects an expired token', async () => {
    const token = await createResetToken(new Date(Date.now() - 1000));

    await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ token, newPassword })
      .expect(400);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const token = await createResetToken(inOneHour());

    const response = await request(app.getHttpServer())
      .post(confirmUrl())
      .send({ token, newPassword: 'short' })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty('newPassword');
  });

  describe('with a valid token', () => {
    let token: string;

    beforeAll(async () => {
      token = await createResetToken(inOneHour());
    });

    it('sets the new password and returns 204 with no body', async () => {
      const response = await request(app.getHttpServer())
        .post(confirmUrl())
        .send({ token, newPassword })
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('marks the token used', async () => {
      const stored = await prisma.passwordResetToken.findUnique({
        where: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
      });

      expect(stored?.usedAt).toBeInstanceOf(Date);
    });

    it('rejects the old password and accepts the new one', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password: oldPassword })
        .expect(401);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('revokes refresh tokens issued before the reset', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken })
        .expect(401);
    });

    it('rejects the same token a second time', async () => {
      await request(app.getHttpServer())
        .post(confirmUrl())
        .send({ token, newPassword: 'AnotherPassword789!' })
        .expect(400);
    });
  });
});
