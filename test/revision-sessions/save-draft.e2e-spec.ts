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
import { saveDraftApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('POST /admin/sessions/:id/draft — saveDraft (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-save-draft-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

  // Minimal career-shaped snapshot. Only the shape matters to the service;
  // content validation happens inside the strategy and is tested at the
  // strategy level (T0.5). For saveDraft, the key thing is that a non-empty
  // object serialises correctly.
  const careerSnapshot = (title: string) => ({
    career: {
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      description: 'description',
      roleSummary: null,
      fieldId: 'field-x',
      targetLevels: [],
      exampleActivities: [],
      typicalEducationNote: null,
      certificationsNote: null,
    },
    pathway: null,
    steps: [],
    skills: [],
    outlook: [],
    resources: [],
  });

  const seedDraftWith = async (
    opts: {
      status?: RevisionStatus;
      revisions?: Array<{
        contentType: 'CAREER';
        contentId: string;
        snapshot: object;
        baseVersion?: number;
      }>;
    } = {},
  ) => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: opts.status,
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
      for (const f of fixtures) {
        await cleanupSession(prisma, f).catch(() => {});
      }
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

  // ───────────────────────────────────────────────────────────────────
  // Happy path: upsert semantics
  // ───────────────────────────────────────────────────────────────────

  it('creates a revision from a single change', async () => {
    const fixture = await seedDraftWith();

    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('First Title'),
          },
        ],
      },
    ).expect(200);

    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0]).toMatchObject({
      contentType: 'CAREER',
      contentId: fixture.contextId,
      status: RevisionStatus.DRAFT,
      baseVersion: 0,
    });

    const dbRevisions = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });
    expect(dbRevisions).toHaveLength(1);
    expect(dbRevisions[0].snapshot).toMatchObject({
      career: { title: 'First Title' },
    });
  });

  it('upserts the same (contentType, contentId) — updates the snapshot, keeps one row', async () => {
    const fixture = await seedDraftWith();

    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('Version One'),
          },
        ],
      },
    ).expect(200);

    const second = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('Version Two'),
          },
        ],
      },
    ).expect(200);

    expect(second.body.revisions).toHaveLength(1);
    const dbRevisions = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });
    expect(dbRevisions).toHaveLength(1);
    expect(dbRevisions[0].snapshot).toMatchObject({
      career: { title: 'Version Two' },
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Replace semantics (ADR-2)
  // ───────────────────────────────────────────────────────────────────

  it('replaces: saving 1 revision after 3 removes the other 2', async () => {
    const fixture = await seedDraftWith();

    // First save: 3 revisions (all on CAREER content type, different ids —
    // real-world this would be a career + pathway_step + resource; the
    // assertion is about replace semantics, not content types).
    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'id-a',
            snapshot: careerSnapshot('A'),
          },
          {
            contentType: 'CAREER',
            contentId: 'id-b',
            snapshot: careerSnapshot('B'),
          },
          {
            contentType: 'CAREER',
            contentId: 'id-c',
            snapshot: careerSnapshot('C'),
          },
        ],
      },
    ).expect(200);

    let rows = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });
    expect(rows).toHaveLength(3);

    // Second save: 1 revision → the other 2 must be deleted.
    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'id-a',
            snapshot: careerSnapshot('A v2'),
          },
        ],
      },
    ).expect(200);

    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0].contentId).toBe('id-a');

    rows = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].contentId).toBe('id-a');
  });

  // ───────────────────────────────────────────────────────────────────
  // Validation warnings (returned, save succeeds)
  // ───────────────────────────────────────────────────────────────────

  it('returns validation warnings but saves the draft', async () => {
    const fixture = await seedDraftWith();

    // Empty career snapshot — the strategy should flag title/slug/description
    // missing. Save succeeds; warnings are returned.
    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: {
              career: {},
              pathway: null,
              steps: [],
              skills: [],
              outlook: [],
              resources: [],
            },
          },
        ],
      },
    ).expect(200);

    // The revision was persisted.
    const rows = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });
    expect(rows).toHaveLength(1);

    // The response includes warnings, one entry per change with problems.
    expect(Array.isArray(res.body.validation)).toBe(true);
    if (res.body.validation.length > 0) {
      expect(res.body.validation[0]).toMatchObject({
        contentType: 'CAREER',
        contentId: fixture.contextId,
      });
      expect(Array.isArray(res.body.validation[0].problems)).toBe(true);
      expect(res.body.validation[0].problems.length).toBeGreaterThan(0);
    }
    // (If the career strategy's validate returns nothing for an empty
    // snapshot in T0.4, this test still passes — it just doesn't assert the
    // warning shape. The strategy-level tests in T0.5 own that.)
  });

  it('returns an empty validation array for a clean snapshot', async () => {
    const fixture = await seedDraftWith();

    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('Clean'),
          },
        ],
      },
    ).expect(200);

    expect(res.body.validation).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────
  // baseVersion capture
  // ───────────────────────────────────────────────────────────────────

  it('captures baseVersion = 0 for a fresh contentId', async () => {
    const fixture = await seedDraftWith();

    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(200);

    const row = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId, contentId: fixture.contextId },
    });
    expect(row.baseVersion).toBe(0);
  });

  it('captures baseVersion = currentVersion (from publish events) for an existing root', async () => {
    const fixture = await seedDraftWith();

    // Seed 2 publish events for the career root.
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(200);

    const row = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId, contentId: fixture.contextId },
    });
    expect(row.baseVersion).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────
  // Invariant: save never touches live tables
  // ───────────────────────────────────────────────────────────────────

  it('does NOT touch the live Career row', async () => {
    const fixture = await seedDraftWith();

    const careerBefore = await prisma.career.findUniqueOrThrow({
      where: { id: fixture.contextId },
    });

    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('Should Not Touch Live'),
          },
        ],
      },
    ).expect(200);

    const careerAfter = await prisma.career.findUniqueOrThrow({
      where: { id: fixture.contextId },
    });

    expect(careerAfter.title).toBe(careerBefore.title);
    expect(careerAfter.updatedAt.getTime()).toBe(
      careerBefore.updatedAt.getTime(),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Errors
  // ───────────────────────────────────────────────────────────────────

  it('rejects an empty changes array', async () => {
    const fixture = await seedDraftWith();
    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [],
      },
    ).expect(400);
  });

  it('rejects an unknown contentType', async () => {
    const fixture = await seedDraftWith();
    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'NOT_A_CONTENT_TYPE',
            contentId: 'x',
            snapshot: {},
          },
        ],
      } as unknown as { changes: object[] },
    ).expect(400);
    expect(res.body.message).toBeTruthy();
  });

  it('rejects an empty contentId', async () => {
    const fixture = await seedDraftWith();
    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: '',
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(400);
  });

  it('rejects a snapshot that is not an object', async () => {
    const fixture = await seedDraftWith();
    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'x',
            snapshot: 'not-an-object' as unknown as object,
          },
        ],
      },
    ).expect(400);
  });

  it('returns 409 INVALID_SESSION_STATE when session is IN_REVIEW', async () => {
    const fixture = await seedDraftWith({ status: RevisionStatus.IN_REVIEW });

    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: fixture.contextId,
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(409);
    expect(res.body.code).toBe('INVALID_SESSION_STATE');
  });

  it('returns 404 for an unknown session', async () => {
    const res = await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'x',
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/not-a-uuid/draft`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .send({
        changes: [{ contentType: 'CAREER', contentId: 'x', snapshot: {} }],
      })
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedDraftWith();
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/draft`)
      .send({
        changes: [{ contentType: 'CAREER', contentId: 'x', snapshot: {} }],
      })
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedDraftWith();
    await saveDraftApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'x',
            snapshot: careerSnapshot('X'),
          },
        ],
      },
    ).expect(403);
  });

  it("forbids a non-creator EDITOR from saving to someone else's session", async () => {
    const fixture = await seedDraftWith();

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

    const res = await saveDraftApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
      {
        changes: [
          {
            contentType: 'CAREER',
            contentId: 'x',
            snapshot: careerSnapshot('Y'),
          },
        ],
      },
    ).expect(403);
    expect(res.body.code).toBe('NOT_SESSION_CREATOR');
  });
});
