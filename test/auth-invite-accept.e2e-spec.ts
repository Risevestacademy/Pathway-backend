import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash, randomBytes } from 'crypto';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  type RegisteredUser,
  wireNotificationMock,
} from './utils/auth';

type AcceptBody = {
  accessToken: string;
  refreshToken?: string;
  user: { id: string; role: Role };
};

type ErrorBody = { error: string; code?: string };

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const hour = 60 * 60 * 1000;

describe('Staff invite acceptance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  let adminId: string;
  const timestamp = Date.now();
  const marker = `e2e-invite-accept-${timestamp}`;

  const accept = (
    token: string,
    accessToken: string | null,
    platform?: 'mobile',
  ) => {
    let req = request(app.getHttpServer())
      .post(`${apiPrefix}/auth/invites/accept`)
      .send({ token });
    if (accessToken) req = req.set('Authorization', `Bearer ${accessToken}`);
    if (platform) req = req.set('X-Client-Platform', platform);
    return req;
  };

  const register = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${label}@test.com`,
      platform: 'mobile',
    });
    userIds.push(user.id);
    return user;
  };

  const invite = async (
    email: string,
    data: { expiresAt?: Date; acceptedAt?: Date; revokedAt?: Date } = {},
    role: Role = Role.EDITOR,
  ) => {
    const token = randomBytes(32).toString('hex');
    const row = await prisma.staffInvite.create({
      data: {
        email,
        role,
        tokenHash: sha256(token),
        invitedById: adminId,
        expiresAt: new Date(Date.now() + 24 * hour),
        ...data,
      },
    });
    return { token, id: row.id };
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
    prisma = app.get(PrismaService);
    await app.init();

    wireNotificationMock();

    const admin = await register('admin');
    adminId = admin.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.ADMIN },
    });
  });

  afterAll(async () => {
    await prisma.staffInvite.deleteMany({
      where: { email: { startsWith: marker } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('a valid invite', () => {
    let user: RegisteredUser;
    let accepted: AcceptBody;
    let inviteId: string;
    let inviteToken: string;

    beforeAll(async () => {
      user = await register('happy');
      const created = await invite(user.email, {}, Role.REVIEWER);
      inviteId = created.id;
      inviteToken = created.token;

      const response = await accept(
        created.token,
        user.accessToken,
        'mobile',
      ).expect(200);
      accepted = response.body as AcceptBody;
    });

    it('returns the promoted user and a fresh token pair', () => {
      expect(accepted.user).toEqual(
        expect.objectContaining({ id: user.id, role: Role.REVIEWER }),
      );
      expect(accepted.accessToken).toEqual(expect.any(String));
      expect(accepted.refreshToken).toEqual(expect.any(String));
    });

    it('stores the role and marks the invite accepted', async () => {
      const [dbUser, dbInvite] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.staffInvite.findUniqueOrThrow({ where: { id: inviteId } }),
      ]);

      expect(dbUser.role).toBe(Role.REVIEWER);
      expect(dbInvite.acceptedAt).toBeInstanceOf(Date);
    });

    it('issues an access token that carries the new role', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/admin/careers`)
        .set('Authorization', `Bearer ${accepted.accessToken}`)
        .expect(200);
    });

    it('revokes the refresh tokens issued before acceptance', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
    });

    it('keeps the new refresh token working', async () => {
      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .set('X-Client-Platform', 'mobile')
        .send({ refreshToken: accepted.refreshToken })
        .expect(200);
    });

    it('returns 409 INVITE_ALREADY_ACCEPTED when the token is used again', async () => {
      const response = await accept(inviteToken, accepted.accessToken).expect(
        409,
      );

      expect((response.body as ErrorBody).code).toBe('INVITE_ALREADY_ACCEPTED');
    });
  });

  it('sets the refresh token cookie for web clients', async () => {
    const user = await register('web');
    const { token } = await invite(user.email);

    const response = await accept(token, user.accessToken).expect(200);

    expect((response.body as AcceptBody).refreshToken).toBeUndefined();
    expect(String(response.headers['set-cookie'])).toContain('refreshToken=');
  });

  it('lets exactly one of two concurrent redemptions succeed', async () => {
    const user = await register('race');
    const { token } = await invite(user.email);

    const responses = await Promise.all([
      accept(token, user.accessToken),
      accept(token, user.accessToken),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((r) => r.status === 409)!;
    expect((conflict.body as ErrorBody).code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  describe('rejections', () => {
    let user: RegisteredUser;

    beforeAll(async () => {
      user = await register('rejected');
    });

    const expectError = async (
      token: string,
      status: number,
      error: string,
      code: string,
      accessToken = user.accessToken,
    ) => {
      const response = await accept(token, accessToken).expect(status);
      expect(response.body).toEqual(expect.objectContaining({ error, code }));
    };

    it('returns 404 INVITE_NOT_FOUND for an unknown token', async () => {
      await expectError(
        randomBytes(32).toString('hex'),
        404,
        'NOT_FOUND',
        'INVITE_NOT_FOUND',
      );
    });

    it('returns 404 INVITE_NOT_FOUND for a revoked invite', async () => {
      const { token } = await invite(user.email, { revokedAt: new Date() });

      await expectError(token, 404, 'NOT_FOUND', 'INVITE_NOT_FOUND');
    });

    it('returns 410 INVITE_EXPIRED for an expired invite', async () => {
      const { token } = await invite(user.email, {
        expiresAt: new Date(Date.now() - hour),
      });

      await expectError(token, 410, 'GONE', 'INVITE_EXPIRED');
    });

    it('returns 409 INVITE_ALREADY_ACCEPTED for a used invite', async () => {
      const { token } = await invite(user.email, { acceptedAt: new Date() });

      await expectError(token, 409, 'CONFLICT', 'INVITE_ALREADY_ACCEPTED');
    });

    it('returns 403 INVITE_EMAIL_MISMATCH and leaves the invite pending', async () => {
      const { token, id } = await invite(`${marker}-someone-else@test.com`);

      await expectError(token, 403, 'FORBIDDEN', 'INVITE_EMAIL_MISMATCH');

      const row = await prisma.staffInvite.findUniqueOrThrow({ where: { id } });
      expect(row.acceptedAt).toBeNull();
      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUser.role).toBe(Role.USER);
    });

    it('returns 403 EMAIL_NOT_VERIFIED when the email is no longer verified', async () => {
      const unverified = await register('unverified');
      const { token, id } = await invite(unverified.email);
      await prisma.user.update({
        where: { id: unverified.id },
        data: { emailVerifiedAt: null },
      });

      await expectError(
        token,
        403,
        'FORBIDDEN',
        'EMAIL_NOT_VERIFIED',
        unverified.accessToken,
      );

      const row = await prisma.staffInvite.findUniqueOrThrow({ where: { id } });
      expect(row.acceptedAt).toBeNull();
    });

    it('returns 401 without an access token', async () => {
      const { token } = await invite(user.email);

      await accept(token, null).expect(401);
    });

    it('returns 400 VALIDATION_ERROR for an empty token', async () => {
      const response = await accept('', user.accessToken).expect(400);

      expect((response.body as ErrorBody).error).toBe('VALIDATION_ERROR');
    });
  });
});
