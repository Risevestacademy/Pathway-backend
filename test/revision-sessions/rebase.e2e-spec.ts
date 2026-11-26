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
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { rebaseApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('POST /admin/sessions/:id/rebase — rebase (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-rebase-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

  // Seed a DRAFT session with N revisions on distinct contentIds (so the
  // unique constraint (sessionId, contentType, contentId) doesn't fire).
  // Each revision has the given baseVersion.
  const seedDraft = async (baseVersions: number[]) => {
    const revisions = baseVersions.map((baseVersion, i) => ({
      contentType: 'CAREER' as const,
      contentId: `placeholder-${i}`,
      snapshot: {},
      baseVersion,
    }));
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      createdCareer: true,
      status: RevisionStatus.DRAFT,
      revisions,
    });
    // Point all revisions at the session's contextId — but they have distinct
    // contentIds already, so we can't rewrite them all to the same id. Leave
    // them as the placeholder ids; publish-event counts are per
    // (contentType, contentId), and each revision references its own
    // contentId. For the test, we seed events against each revision's
    // contentId.
    fixtures.push(fixture);
    return fixture;
  };

  const seededPublishEventIds: string[] = [];

  const setPublishEvents = async (
    revisionId: string,
    contentId: string,
    count: number,
  ) => {
    if (count === 0) return;
    await prisma.contentRevisionPublishEvent.createMany({
      data: Array.from({ length: count }, () => ({
        contentType: 'CAREER' as const,
        contentId,
        revisionId,
      })),
    });
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

  afterEach(async () => {
    await prisma.contentRevisionPublishEvent.deleteMany({
      where: { contentId: { startsWith: 'placeholder-' } },
    });
  });

  it('rebases a stale DRAFT session: baseVersion updated, rebased true', async () => {
    const fixture = await seedDraft([0]);
    await setPublishEvents(fixture.revisionIds[0], 'placeholder-0', 2);

    const res = await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.sessionId).toBe(fixture.sessionId);
    expect(res.body.rebased).toBe(true);
    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0]).toMatchObject({
      id: fixture.revisionIds[0],
      contentType: 'CAREER',
      contentId: 'placeholder-0',
      baseVersion: 2,
      wasStale: true,
    });

    const dbRev = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: fixture.revisionIds[0] },
    });
    expect(dbRev.baseVersion).toBe(2);
  });

  it('returns rebased: false when nothing is stale; no writes', async () => {
    const fixture = await seedDraft([0]);
    // No publish events → currentVersion = 0 → baseVersion 0 not stale.

    const before = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: fixture.revisionIds[0] },
    });

    const res = await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.rebased).toBe(false);
    expect(res.body.revisions[0].baseVersion).toBe(0);
    expect(res.body.revisions[0].wasStale).toBe(false);

    const after = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: fixture.revisionIds[0] },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.baseVersion).toBe(before.baseVersion);
  });

  it('rebases only the stale revisions; fresh ones are untouched', async () => {
    // Two revisions: one at baseVersion 0 (stale against 2 events), one at
    // baseVersion 3 (current is 3 events, so not stale).
    const fixture = await seedDraft([0, 3]);
    await setPublishEvents(fixture.revisionIds[0], 'placeholder-0', 2);
    await setPublishEvents(fixture.revisionIds[1], 'placeholder-1', 3);

    const res = await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.rebased).toBe(true);
    expect(res.body.revisions).toHaveLength(2);

    const byContentId = new Map(
      (
        res.body.revisions as Array<{
          contentId: string;
          baseVersion: number;
          wasStale: boolean;
        }>
      ).map((r) => [r.contentId, r]),
    );

    expect(byContentId.get('placeholder-0')).toMatchObject({
      baseVersion: 2,
      wasStale: true,
    });
    expect(byContentId.get('placeholder-1')).toMatchObject({
      baseVersion: 3,
      wasStale: false,
    });
  });

  it('forbids a non-creator EDITOR with 403 NOT_SESSION_CREATOR', async () => {
    const fixture = await seedDraft([0]);

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

    const res = await rebaseApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
    ).expect(403);
    expect(res.body.code).toBe('NOT_SESSION_CREATOR');
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

    const res = await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(409);
    expect(res.body.code).toBe('INVALID_SESSION_STATE');
  });

  it('returns 404 for an unknown session', async () => {
    const res = await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/not-a-uuid/rebase`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedDraft([0]);
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/rebase`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedDraft([0]);
    await rebaseApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });
});
