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
import { getDiffApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('GET /admin/sessions/:id/diff — buildDiff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-build-diff-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

  // Reuse the plan-clean fixture proven in submit.e2e-spec.ts.
  const cleanCareerSnapshot = (title: string) => ({
    career: {
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      description: 'A description.',
      roleSummary: 'What the role involves.',
      fieldId: 'field-x',
      targetLevels: ['STUDENT'],
      exampleActivities: ['Build things'],
      typicalEducationNote: 'A degree helps.',
      certificationsNote: 'Not required.',
    },
    pathway: { title: 'Pathway', description: null },
    steps: [
      {
        id: 'new-step-1',
        order: 1,
        title: 'Step 1',
        description: null,
        learningObjective: 'Learn the thing',
        prerequisites: null,
        expectedActivity: 'Do the thing',
        skillIds: ['skill-x'],
        resourceIds: [],
      },
    ],
    skills: [{ skillId: 'skill-x', importance: 'REQUIRED' }],
    outlook: [],
    resources: [],
  });

  const seedWithCareerRevision = async (
    opts: {
      status?: RevisionStatus;
      title?: string;
      baseVersion?: number;
    } = {},
  ) => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: opts.status,
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: cleanCareerSnapshot(opts.title ?? 'Title'),
          baseVersion: opts.baseVersion ?? 0,
        },
      ],
    });
    const rev = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId },
    });
    await prisma.contentRevision.update({
      where: { id: rev.id },
      data: { contentId: fixture.contextId },
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
      roles: [Role.USER, Role.EDITOR, Role.REVIEWER],
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

  // ───────────────────────────────────────────────────────────────────
  // Shape
  // ───────────────────────────────────────────────────────────────────

  it('returns the full DTO shape for a clean DRAFT session', async () => {
    const fixture = await seedWithCareerRevision({ title: 'Shape Title' });

    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    // Outer shape.
    expect(res.body).toMatchObject({
      sessionId: fixture.sessionId,
      contextType: 'CAREER',
      contextId: fixture.contextId,
    });
    expect(typeof res.body.contextTitle).toBe('string');
    expect(res.body.contextTitle.length).toBeGreaterThan(0);
    expect(res.body.stale).toBe(false);
    expect(Array.isArray(res.body.blockers)).toBe(true);
    expect(Array.isArray(res.body.advisories)).toBe(true);
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(typeof res.body.baseVersion).toBe('number');
    expect(typeof res.body.liveVersion).toBe('number');

    // Clean snapshot → no blockers.
    expect(res.body.blockers).toEqual([]);
  });

  it('sections is an array of SectionChanges entries', async () => {
    const fixture = await seedWithCareerRevision();

    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    for (const section of res.body.sections) {
      expect(section).toHaveProperty('section');
      expect(section).toHaveProperty('contentType');
      expect(Array.isArray(section.changed)).toBe(true);
      expect(Array.isArray(section.added)).toBe(true);
      expect(Array.isArray(section.removed)).toBe(true);
      expect(Array.isArray(section.moved)).toBe(true);
    }
  });

  it('returns a valid DTO for an empty session (no revisions)', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-empty`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.sessionId).toBe(fixture.sessionId);
    expect(res.body.sections).toEqual([]);
    expect(res.body.blockers).toEqual([]);
    expect(res.body.advisories).toEqual([]);
    expect(res.body.stale).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────
  // Staleness
  // ───────────────────────────────────────────────────────────────────

  it('reports stale: false when baseVersion matches currentVersion', async () => {
    const fixture = await seedWithCareerRevision({ baseVersion: 0 });
    // No publish events → currentVersion = 0 → not stale.

    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.stale).toBe(false);
  });

  it('reports stale: true when the revision is behind the live version', async () => {
    const fixture = await seedWithCareerRevision({ baseVersion: 1 });
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.stale).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────
  // Read-only invariant
  // ───────────────────────────────────────────────────────────────────

  it('does NOT mutate the session or its revisions', async () => {
    const fixture = await seedWithCareerRevision();

    const before = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    const revisionsBefore = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });

    await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    const after = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    const revisionsAfter = await prisma.contentRevision.findMany({
      where: { sessionId: fixture.sessionId },
    });

    expect(after.status).toBe(before.status);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(revisionsAfter.map((r) => r.id).sort()).toEqual(
      revisionsBefore.map((r) => r.id).sort(),
    );
    for (const r of revisionsAfter) {
      const b = revisionsBefore.find((x) => x.id === r.id)!;
      expect(r.updatedAt.getTime()).toBe(b.updatedAt.getTime());
      expect(r.status).toBe(b.status);
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Authorization
  // ───────────────────────────────────────────────────────────────────

  it('allows a REVIEWER to read a session in review', async () => {
    const fixture = await seedWithCareerRevision({
      status: RevisionStatus.IN_REVIEW,
    });

    await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
    ).expect(200);
  });

  it('forbids an EDITOR who is not the creator', async () => {
    const fixture = await seedWithCareerRevision();

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

    const res = await getDiffApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
    ).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedWithCareerRevision();
    await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedWithCareerRevision();
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/${fixture.sessionId}/diff`)
      .expect(401);
  });

  // ───────────────────────────────────────────────────────────────────
  // Errors
  // ───────────────────────────────────────────────────────────────────

  it('returns 404 for an unknown session', async () => {
    const res = await getDiffApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/not-a-uuid/diff`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });
});
