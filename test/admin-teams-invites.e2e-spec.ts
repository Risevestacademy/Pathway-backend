import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { Prisma, Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

type InviteBody = {
  id: string;
  status: string;
  invitedById: string;
  invitedByName: string | null;
};

describe('Admin team invites (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const tokens = {} as Record<Role, string>;
  const inviteIds: Record<string, string> = {};

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-invites-${timestamp}`;
  const day = 24 * 60 * 60 * 1000;

  const list = (
    query: Record<string, string | number>,
    token = tokens[Role.ADMIN],
  ) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/admin/teams/invites`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  const revoke = (id: string, token = tokens[Role.ADMIN]) =>
    request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/teams/invites/${id}`)
      .set('Authorization', `Bearer ${token}`);

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

    const admin = await prisma.user.findFirstOrThrow({
      where: { email: `${marker}-admin@test.com` },
    });
    const now = Date.now();
    const seeds: [string, Partial<Prisma.StaffInviteUncheckedCreateInput>][] = [
      ['pending', { expiresAt: new Date(now + 7 * day) }],
      ['second-pending', { expiresAt: new Date(now + 6 * day) }],
      ['expired', { expiresAt: new Date(now - day) }],
      [
        'accepted',
        { expiresAt: new Date(now + 5 * day), acceptedAt: new Date(now) },
      ],
      [
        'revoked',
        { expiresAt: new Date(now + 5 * day), revokedAt: new Date(now) },
      ],
    ];
    for (const [label, data] of seeds) {
      const created = await prisma.staffInvite.create({
        data: {
          email: `${marker}-${label}@invitee.test`,
          role: Role.EDITOR,
          tokenHash: `${marker}-${label}-hash`,
          invitedById: admin.id,
          expiresAt: new Date(now + 7 * day),
          ...data,
        },
      });
      inviteIds[label] = created.id;
    }
  });

  afterAll(async () => {
    await prisma.staffInvite.deleteMany({
      where: { id: { in: Object.values(inviteIds) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('authorization', () => {
    it('returns 401 without an access token on both routes', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/admin/teams/invites`)
        .expect(401);
      const response = await request(app.getHttpServer())
        .delete(`${apiPrefix}/admin/teams/invites/${inviteIds.pending}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    it.each([Role.USER, Role.EDITOR, Role.REVIEWER, Role.PUBLISHER])(
      'returns 403 to %s on both routes',
      async (role) => {
        await list({}, tokens[role]).expect(403);
        const response = await revoke(inviteIds.pending, tokens[role]).expect(
          403,
        );

        expect(response.body.error).toBe('FORBIDDEN');
        const invite = await prisma.staffInvite.findUniqueOrThrow({
          where: { id: inviteIds.pending },
        });
        expect(invite.revokedAt).toBeNull();
      },
    );
  });

  describe('GET /admin/teams/invites', () => {
    it('splits every invite into exactly one status, with totals that add up', async () => {
      const expected: Record<string, string[]> = {
        PENDING: [inviteIds.pending, inviteIds['second-pending']],
        EXPIRED: [inviteIds.expired],
        ACCEPTED: [inviteIds.accepted],
        REVOKED: [inviteIds.revoked],
      };
      const all = await list({ limit: 100 }).expect(200);

      let sum = 0;
      for (const [status, ids] of Object.entries(expected)) {
        const response = await list({ status, limit: 100 }).expect(200);
        const items = response.body.items as InviteBody[];
        sum += response.body.total as number;

        expect(items.every((item) => item.status === status)).toBe(true);
        expect(items.map((item) => item.id)).toEqual(
          expect.arrayContaining(ids),
        );
        const others = Object.values(inviteIds).filter(
          (id) => !ids.includes(id),
        );
        expect(items.some((item) => others.includes(item.id))).toBe(false);
      }
      expect(sum).toBe(all.body.total);
    });

    it('paginates newest first with the unfiltered total', async () => {
      const total = await prisma.staffInvite.count();
      const first = await list({ page: 1, limit: 2 }).expect(200);
      const second = await list({ page: 2, limit: 2 }).expect(200);

      expect(first.body).toMatchObject({ total, page: 1, limit: 2 });
      expect(second.body).toMatchObject({ total, page: 2, limit: 2 });
      const ids = [
        ...(first.body.items as InviteBody[]),
        ...(second.body.items as InviteBody[]),
      ].map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('never returns tokenHash and includes the inviter', async () => {
      const response = await list({ limit: 100 }).expect(200);
      const items = response.body.items as InviteBody[];
      const pending = items.find((item) => item.id === inviteIds.pending);

      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
      expect(JSON.stringify(response.body)).not.toContain(
        `${marker}-pending-hash`,
      );
      expect(pending).toMatchObject({
        status: 'PENDING',
        invitedById: userIds[Object.values(Role).indexOf(Role.ADMIN)],
      });
      expect(pending).toHaveProperty('invitedByName');
    });

    it.each([
      ['an unknown status', { status: 'OPEN' }],
      ['a page below 1', { page: 0 }],
      ['a limit above 100', { limit: 101 }],
    ])('returns 400 for %s', async (_label, query) => {
      const response = await list(query).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /admin/teams/invites/:id', () => {
    it.each(['accepted', 'expired', 'revoked'])(
      'returns 409 for an %s invite and leaves it unchanged',
      async (label) => {
        const before = await prisma.staffInvite.findUniqueOrThrow({
          where: { id: inviteIds[label] },
        });

        const response = await revoke(inviteIds[label]).expect(409);

        expect(response.body).toMatchObject({
          error: 'CONFLICT',
          message: 'Only a pending invite can be revoked',
        });
        const after = await prisma.staffInvite.findUniqueOrThrow({
          where: { id: inviteIds[label] },
        });
        expect(after).toEqual(before);
      },
    );

    it('returns 404 for an invite that does not exist', async () => {
      const response = await revoke(
        '00000000-0000-4000-8000-000000000000',
      ).expect(404);

      expect(response.body).toMatchObject({
        error: 'NOT_FOUND',
        message: 'Invite not found',
      });
    });

    it('returns 400 for a non-UUID id', async () => {
      await revoke('invite-1').expect(400);
    });

    it('revokes a pending invite, keeps the row, then lists it as REVOKED', async () => {
      const response = await revoke(inviteIds['second-pending']).expect(200);

      expect(response.body).toEqual({ message: 'Invite revoked' });
      const invite = await prisma.staffInvite.findUniqueOrThrow({
        where: { id: inviteIds['second-pending'] },
      });
      expect(invite.revokedAt).toBeInstanceOf(Date);

      const listed = await list({ status: 'REVOKED', limit: 100 }).expect(200);
      expect(
        (listed.body.items as InviteBody[]).map((item) => item.id),
      ).toContain(inviteIds['second-pending']);

      await revoke(inviteIds['second-pending']).expect(409);
    });
  });
});
