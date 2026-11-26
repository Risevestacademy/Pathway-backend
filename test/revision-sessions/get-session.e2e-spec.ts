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
import { RevisionStatus, Role } from '../../src/generated/prisma/client';

import {
  notificationMock,
  wireNotificationMock,
  registerAndVerify,
} from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { getSessionApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('GET /admin/sessions/:id — getSession (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-get-session-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

  const seedWithRevision = async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: {
            career: { title: 'x', slug: 'x', description: 'x', fieldId: 'f' },
          },
          baseVersion: 0,
        },
      ],
    });
    // Fix the revision's contentId to the session's contextId (a career
    // revision always has contentId === contextId for a CAREER session).
    if (fixture.revisionIds.length === 1) {
      await prisma.contentRevision.update({
        where: { id: fixture.revisionIds[0] },
        data: { contentId: fixture.contextId },
      });
    }
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
      roles: [Role.USER, Role.EDITOR, Role.REVIEWER, Role.ADMIN],
    });
  });

  afterAll(async () => {
    for (const f of fixtures) await cleanupSession(prisma, f);
    if (extraUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
    }
    await users.cleanup();
    await app.close();
  });

  it('returns the session with revision summaries (no snapshot)', async () => {
    const fixture = await seedWithRevision();

    const res = await getSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body).toMatchObject({
      id: fixture.sessionId,
      contextType: 'CAREER',
      contextId: fixture.contextId,
      status: RevisionStatus.DRAFT,
      createdById: users.ids[Role.EDITOR],
      submittedAt: null,
      publishedAt: null,
    });
    expect(Array.isArray(res.body.revisions)).toBe(true);
    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0]).toMatchObject({
      contentType: 'CAREER',
      contentId: fixture.contextId,
      status: RevisionStatus.DRAFT,
      baseVersion: 0,
    });
    // No snapshot field on the summary.
    expect(res.body.revisions[0]).not.toHaveProperty('snapshot');
    // The summary must include updatedAt.
    expect(typeof res.body.revisions[0].updatedAt).toBe('string');
  });

  it('allows a REVIEWER who is not the creator', async () => {
    const fixture = await seedWithRevision();
    await getSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
    ).expect(200);
  });

  it('allows an ADMIN who is not the creator', async () => {
    const fixture = await seedWithRevision();
    await getSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.ADMIN],
      fixture.sessionId,
    ).expect(200);
  });

  it('forbids an EDITOR who is not the creator', async () => {
    const fixture = await seedWithRevision();
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

    const res = await getSessionApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
    ).expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns 404 for an unknown session', async () => {
    const res = await getSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/not-a-uuid`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedWithRevision();
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/${fixture.sessionId}`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedWithRevision();
    await getSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });
});
