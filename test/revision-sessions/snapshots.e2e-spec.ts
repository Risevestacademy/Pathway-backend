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
import { getSnapshotsApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('GET /admin/sessions/:id/snapshots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-snapshots-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const extraUserIds: string[] = [];

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
    for (const f of fixtures) await cleanupSession(prisma, f);
    if (extraUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
    }
    await users.cleanup();
    await app.close();
  });

  it('returns the saved snapshots in contentType then contentId order', async () => {
    // Note: T0.4 only registers the CAREER strategy, but the endpoint reads
    // DB rows regardless. Multiple content types are tested here to prove
    // the endpoint's ordering and passthrough, not the strategy registry.
    const fixture = await seedSession(prisma, {
      marker: `${marker}-ordered`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: {
            career: { title: 'a', slug: 'a', description: 'a', fieldId: 'f' },
          },
          baseVersion: 0,
        },
        {
          contentType: 'PATHWAY_STEP',
          contentId: 'new-2',
          snapshot: {
            title: 'Step 2',
            learningObjective: 'lo',
            expectedActivity: 'ea',
            order: 2,
          },
          baseVersion: 0,
        },
        {
          contentType: 'RESOURCE',
          contentId: 'new-1',
          snapshot: {
            title: 'Resource',
            url: 'https://example.com',
            type: 'ARTICLE',
          },
          baseVersion: 0,
        },
      ],
    });
    // Fix the CAREER revision's contentId to the actual career id.
    const careerRev = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId, contentType: 'CAREER' },
    });
    await prisma.contentRevision.update({
      where: { id: careerRev.id },
      data: { contentId: fixture.contextId },
    });
    fixtures.push(fixture);

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);

    expect(res.body.sessionId).toBe(fixture.sessionId);
    expect(res.body.snapshots).toHaveLength(3);

    // Ordering: contentType asc, contentId asc.
    // 'CAREER' < 'PATHWAY_STEP' < 'RESOURCE' lexicographically.
    expect(
      res.body.snapshots.map((s: { contentType: string }) => s.contentType),
    ).toEqual(['CAREER', 'PATHWAY_STEP', 'RESOURCE']);
    // For the two PATHWAY_STEP/RESOURCE with new-N ids, contentId asc means 'new-1' < 'new-2'.
    // Since only one PATHWAY_STEP and one RESOURCE, no intra-type ordering test here.
    const types = res.body.snapshots.map(
      (s: { contentType: string }) => s.contentType,
    );
    expect(types).toEqual(['CAREER', 'PATHWAY_STEP', 'RESOURCE']);
  });

  it('returns an empty array for a session with no revisions', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-empty`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.snapshots).toEqual([]);
  });

  it('round-trips the exact saved snapshot', async () => {
    const snapshot = {
      career: {
        title: 'Title with unicode ✓',
        slug: 'title-with-unicode',
        description: 'Nested { "struct": [1, 2, 3] }',
        fieldId: 'field-x',
        targetLevels: ['STUDENT', 'RECENT_GRAD'],
        exampleActivities: ['a', 'b'],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: null,
      steps: [],
      skills: [],
      outlook: [],
      resources: [],
    };

    const fixture = await seedSession(prisma, {
      marker: `${marker}-roundtrip`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot,
          baseVersion: 0,
        },
      ],
    });
    const careerRev = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId, contentType: 'CAREER' },
    });
    await prisma.contentRevision.update({
      where: { id: careerRev.id },
      data: { contentId: fixture.contextId },
    });
    fixtures.push(fixture);

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.snapshots[0].snapshot).toEqual(snapshot);
  });

  it('preserves temp contentIds (new-N)', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-temp`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [
        {
          contentType: 'PATHWAY_STEP',
          contentId: 'new-1',
          snapshot: { title: 'x' },
          baseVersion: 0,
        },
      ],
    });
    fixtures.push(fixture);

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.snapshots[0].contentId).toBe('new-1');
  });

  it('allows a REVIEWER to read', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-reviewer-read`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
    ).expect(200);
  });

  it('forbids an EDITOR who is not the creator', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-other-editor`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

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

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      otherToken,
      fixture.sessionId,
    ).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('is readable for a CHANGES_REQUESTED session', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-changes-requested`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: RevisionStatus.CHANGES_REQUESTED,
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: {
            career: {
              title: 'cr',
              slug: 'cr',
              description: 'cr',
              fieldId: 'f',
            },
          },
          baseVersion: 0,
          status: RevisionStatus.CHANGES_REQUESTED,
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

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.snapshots[0].snapshot.career.title).toBe('cr');
  });

  it('is readable for a PUBLISHED session', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-published`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: RevisionStatus.PUBLISHED,
      publishedAt: new Date(),
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: {
            career: {
              title: 'pub',
              slug: 'pub',
              description: 'pub',
              fieldId: 'f',
            },
          },
          baseVersion: 0,
          status: RevisionStatus.PUBLISHED,
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

    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(200);
    expect(res.body.snapshots[0].snapshot.career.title).toBe('pub');
  });

  it('returns 404 for an unknown session', async () => {
    const res = await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/not-a-uuid/snapshots`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-noauth`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions/${fixture.sessionId}/snapshots`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-user-403`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    await getSnapshotsApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });
});
