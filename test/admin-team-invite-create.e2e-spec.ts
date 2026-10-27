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
import { Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Admin team invites — create (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const inviteIds: string[] = [];
  const tokens = {} as Record<Role, string>;

  const password = 'Password123!';
  const marker = `e2e-admin-invite-create-${Date.now()}`;

  const hashOf = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  const invite = (body: Record<string, unknown>, token = tokens[Role.ADMIN]) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/teams/invites`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const freshEmail = (label: string) =>
    `${marker}-${label}-${Date.now()}@invitee.test`;

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

    for (const role of Object.values(Role)) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds.push(registered.id);
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password })
        .expect(200);
      tokens[role] = (login.body as { accessToken: string }).accessToken;
    }
  });

  beforeEach(() => {
    notificationMock.send.mockClear();
  });

  afterAll(async () => {
    await prisma.staffInvite.deleteMany({
      where: {
        OR: [{ id: { in: inviteIds } }, { email: { contains: marker } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  // ─── 1. Happy path ──────────────────────────────────────────────────

  it('creates a pending invite, stores only the hash, and emails a link', async () => {
    const email = freshEmail('happy');

    const response = await invite({ email, role: Role.EDITOR }).expect(201);

    expect(response.body).toMatchObject({
      email,
      role: Role.EDITOR,
      emailSent: true,
    });
    // No token or hash leaks back to the client.
    expect(JSON.stringify(response.body)).not.toMatch(/[0-9a-f]{64}/);

    const row = await prisma.staffInvite.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    inviteIds.push(row.id);

    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.acceptedAt).toBeNull();
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // ─── 2. Auth ────────────────────────────────────────────────────────

  it('returns 401 without an access token', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/teams/invites`)
      .send({ email: freshEmail('no-auth'), role: Role.EDITOR })
      .expect(401);
  });

  it.each([Role.USER, Role.EDITOR, Role.REVIEWER, Role.PUBLISHER])(
    'returns 403 to %s and creates no invite',
    async (role) => {
      const email = freshEmail(`forbidden-${role.toLowerCase()}`);

      await invite({ email, role: Role.EDITOR }, tokens[role]).expect(403);

      await expect(
        prisma.staffInvite.count({ where: { email } }),
      ).resolves.toBe(0);
    },
  );

  // ─── 3. Validation ──────────────────────────────────────────────────

  it.each([
    ['missing email', { role: Role.EDITOR }, 'email'],
    ['invalid email', { email: 'nope', role: Role.EDITOR }, 'email'],
    ['missing role', { email: 'x@example.com' }, 'role'],
    ['USER role', { email: 'x@example.com', role: Role.USER }, 'role'],
    ['unknown role', { email: 'x@example.com', role: 'SUPERADMIN' }, 'role'],
  ])('returns 400 for %s', async (_label, body, field) => {
    const response = await invite(body).expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty(field);
  });

  // ─── 4. The business rule that only e2e can prove ───────────────────

  it('re-inviting the same email leaves exactly one pending invite', async () => {
    const email = freshEmail('replace');

    const first = await invite({ email, role: Role.EDITOR }).expect(201);
    const second = await invite({ email, role: Role.REVIEWER }).expect(201);
    inviteIds.push(second.body.id);

    await expect(
      prisma.staffInvite.count({
        where: { email, acceptedAt: null, revokedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.staffInvite.findUnique({ where: { id: first.body.id } }),
    ).resolves.toBeNull();
  });
});
