import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  CareerStatus,
  RevisionStatus,
  Role,
} from '../../src/generated/prisma/client';

import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { discardApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('DELETE /admin/sessions/:id — discard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-discard-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

  const seedDraft = async (
    opts: {
      createdCareer?: boolean;
      revisions?: Array<{
        contentType: 'CAREER';
        contentId: string;
        snapshot: object;
      }>;
    } = {},
  ) => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      createdCareer: opts.createdCareer ?? true,
      status: RevisionStatus.DRAFT,
      revisions: opts.revisions ?? [],
    });
    fixtures.push(fixture);
    return fixture;
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
    await app.listen(0, '127.0.0.1');
    wireNotificationMock();

    users = await registerRoles(app, apiPrefix, prisma, {
      marker,
      roles: [Role.USER, Role.EDITOR],
    });
  });

  afterAll(async () => {
    try {
      for (const f of fixtures) await cleanupSession(prisma, f).catch(() => {});
      if (extraUserIds.length > 0) {
        await prisma.user
          .deleteMany({ where: { id: { in: extraUserIds } } })
          .catch(() => {});
      }
      await users.cleanup().catch(() => {});
    } finally {
      await app.close();
    }
  });

  it('deletes a DRAFT session and cascades its revisions', async () => {
    const fixture = await seedDraft({
      revisions: [
        { contentType: 'CAREER', contentId: 'PLACEHOLDER', snapshot: {} },
      ],
    });
    const rev = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId },
    });
    await prisma.contentRevision.update({
      where: { id: rev.id },
      data: { contentId: fixture.contextId },
    });

    const res = await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.message).toMatch(/discarded/i);

    const sessionAfter = await prisma.revisionSession.findUnique({
      where: { id: fixture.sessionId },
    });
    expect(sessionAfter).toBeNull();
    const revisionsAfter = await prisma.contentRevision.count({
      where: { sessionId: fixture.sessionId },
    });
    expect(revisionsAfter).toBe(0);
  });

  it('deletes the DRAFT Career created by the session (createdCareer: true)', async () => {
    const fixture = await seedDraft({ createdCareer: true });

    await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    const careerAfter = await prisma.career.findUnique({
      where: { id: fixture.contextId },
    });
    expect(careerAfter).toBeNull();
  });

  it('leaves an existing Career intact when createdCareer is false', async () => {
    const field = await prisma.field.create({
      data: {
        name: `Field ${marker}-existing`,
        slug: `field-${marker}-existing`,
      },
    });
    const career = await prisma.career.create({
      data: {
        slug: `existing-${marker}`,
        title: `Existing ${marker}`,
        description: 'd',
        exampleActivities: [],
        fieldId: field.id,
        status: CareerStatus.PUBLISHED,
      },
    });

    const fixture = await seedSession(prisma, {
      marker: `${marker}-existing`,
      createdById: users.ids[Role.EDITOR],
      contextId: career.id,
      createCareer: false,
      createdCareer: false,
      status: RevisionStatus.DRAFT,
      revisions: [],
    });
    fixtures.push(fixture);

    await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    const careerAfter = await prisma.career.findUnique({
      where: { id: career.id },
    });
    expect(careerAfter).not.toBeNull();

    await prisma.career.delete({ where: { id: career.id } });
    await prisma.field.delete({ where: { id: field.id } });
  });

  it.each([
    RevisionStatus.IN_REVIEW,
    RevisionStatus.APPROVED,
    RevisionStatus.REJECTED,
    RevisionStatus.CHANGES_REQUESTED,
    RevisionStatus.PUBLISHED,
  ])('returns 409 INVALID_SESSION_STATE for a %s session', async (status) => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-state-${status}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      createdCareer: true,
      status,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(409);
    expect(res.body.code).toBe('INVALID_SESSION_STATE');
  });

  it('forbids a non-creator EDITOR with 403 NOT_SESSION_CREATOR', async () => {
    const fixture = await seedDraft();

    const email = `${marker}-editor2-${Date.now()}@test.com`;
    const password = 'Password123!';
    const registered = await registerAndVerify(app, apiPrefix, {
      email,
      password,
    });
    extraUserIds.push(registered.id);
    await prisma.user.update({
      where: { id: registered.id },
      data: { role: Role.EDITOR },
    });
    const login = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(200);
    const otherToken = (login.body as { accessToken: string }).accessToken;

    const res = await discardApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
    ).expect(403);
    expect(res.body.code).toBe('NOT_SESSION_CREATOR');
    expect(res.body.message).toMatch(/creator can discard/i);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/sessions/not-a-uuid`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedDraft();
    await request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/sessions/${fixture.sessionId}`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedDraft();
    await discardApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });
});
