// test/email-verification.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { PrismaService } from '../src/prisma';

describe('Email verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let userId: string;

  const email = `e2e-verify-${Date.now()}@test.com`;
  const password = 'Password123!';

  const verifyUrl = () => `${apiPrefix}/auth/verify-email`;
  const resendUrl = () => `${apiPrefix}/auth/resend-verification`;

  const createVerificationToken = async (expiresAt: Date): Promise<string> => {
    const token = randomBytes(32).toString('hex');

    await prisma.emailVerificationToken.create({
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
      .send({ email, password, fullName: 'Ada Obi' })
      .expect(201);

    userId = response.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates exactly one verification token on registration', async () => {
    const tokens = await prisma.emailVerificationToken.findMany({
      where: { userId },
    });

    expect(tokens).toHaveLength(1);
  });

  it('can still log in before verifying', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(200);
  });

  it('rejects an unknown token', async () => {
    const response = await request(app.getHttpServer())
      .post(verifyUrl())
      .send({ token: 'not-a-real-token' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'BAD_REQUEST',
        message: 'Invalid or expired verification token',
      }),
    );
  });

  it('rejects an expired token', async () => {
    const token = await createVerificationToken(new Date(Date.now() - 1000));

    await request(app.getHttpServer())
      .post(verifyUrl())
      .send({ token })
      .expect(400);
  });

  describe('resend-verification', () => {
    it('invalidates the token created at registration', async () => {
      const original = await prisma.emailVerificationToken.findFirst({
        where: { userId, usedAt: null },
      });

      await request(app.getHttpServer())
        .post(resendUrl())
        .send({ email })
        .expect(204);

      const stillThere = await prisma.emailVerificationToken.findUnique({
        where: { id: original!.id },
      });
      const active = await prisma.emailVerificationToken.findMany({
        where: { userId, usedAt: null },
      });

      expect(stillThere).toBeNull();
      expect(active).toHaveLength(1);
    });

    it('returns 204 for an email that does not exist', async () => {
      await request(app.getHttpServer())
        .post(resendUrl())
        .send({ email: 'no-such-user@test.com' })
        .expect(204);
    });
  });

  describe('with a valid token', () => {
    let token: string;

    beforeAll(async () => {
      await prisma.emailVerificationToken.deleteMany({
        where: { userId, usedAt: null },
      });
      token = await createVerificationToken(inOneHour());
    });

    it('verifies the email and returns 204 with no body', async () => {
      const response = await request(app.getHttpServer())
        .post(verifyUrl())
        .send({ token })
        .expect(204);

      expect(response.body).toEqual({});

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('returns 204 for a resend after the email is already verified, without creating a new token', async () => {
      await request(app.getHttpServer())
        .post(resendUrl())
        .send({ email })
        .expect(204);

      const active = await prisma.emailVerificationToken.findMany({
        where: { userId, usedAt: null },
      });
      expect(active).toHaveLength(0);
    });

    it('rejects the same token a second time', async () => {
      await request(app.getHttpServer())
        .post(verifyUrl())
        .send({ token })
        .expect(400);
    });
  });
});
