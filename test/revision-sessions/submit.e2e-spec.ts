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

import { notificationMock, wireNotificationMock } from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { submitApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('POST /admin/sessions/:id/submit — submit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-submit-${Date.now()}`;
  const fixtures: SessionFixture[] = [];

  // A plan-clean career snapshot for the CAREER strategy in T0.4.
  //
  // findSnapshotProblems requires (structural):
  //   - no duplicate ids/orders/skillIds
  //   - if steps.length > 0, pathway must be non-null
  //   - step.resourceIds temps must exist in resources
  //
  // buildCareerPlan additionally requires (blockers):
  //   - every required CAREER_FIELD_CONFIG field is non-empty
  //   - skills.length > 0
  //   - steps.length > 0
  //
  // This fixture satisfies all of the above. If a less-obvious career field
  // turns out to be required, the test failure will name it
  // (`MISSING_CAREER_FIELD: field "X"`) and this fixture needs one more field.
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

  // Same as cleanCareerSnapshot, but with a duplicate skillId. This trips
  // findSnapshotProblems with "skills.1: duplicate skillId of skills.0" before
  // validation ever reaches the plan.
  const invalidCareerSnapshot = (title: string) => ({
    ...cleanCareerSnapshot(title),
    skills: [
      { skillId: 'skill-x', importance: 'REQUIRED' as const },
      { skillId: 'skill-x', importance: 'REQUIRED' as const },
    ],
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
      roles: [Role.EDITOR, Role.REVIEWER, Role.USER],
    });
  });

  afterAll(async () => {
    try {
      for (const f of fixtures) {
        await cleanupSession(prisma, f).catch(() => {});
      }
      await users.cleanup().catch(() => {});
    } finally {
      await app.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Happy path
  // ───────────────────────────────────────────────────────────────────

  it('moves a clean DRAFT session to IN_REVIEW and sets submittedAt', async () => {
    const fixture = await seedDraftWith({
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: cleanCareerSnapshot('Clean Title'),
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

    const before = new Date();
    const res = await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    );

    // Diagnostic guard: if the fixture isn't plan-clean, surface the
    // blockers with the field name so the fixture can be fixed in one edit.
    if (res.status !== 200) {
      console.error(
        'Submit failed with',
        res.status,
        '— body:',
        JSON.stringify(res.body, null, 2),
      );
    }
    expect(res.status).toBe(200);

    expect(res.body).toMatchObject({
      id: fixture.sessionId,
      status: RevisionStatus.IN_REVIEW,
    });
    expect(res.body.submittedAt).toBeTruthy();
    const submittedAt = new Date(res.body.submittedAt);
    expect(submittedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
    expect(submittedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.IN_REVIEW);
    expect(session.submittedAt).not.toBeNull();

    const revision = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: rev.id },
    });
    expect(revision.status).toBe(RevisionStatus.IN_REVIEW);
  });

  // ───────────────────────────────────────────────────────────────────
  // All-or-nothing
  // ───────────────────────────────────────────────────────────────────

  it('stays DRAFT on validation failure (duplicate skillId in the snapshot)', async () => {
    const fixture = await seedDraftWith({
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: invalidCareerSnapshot('Invalid Title'),
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

    const res = await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(400);

    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(res.body.details?.problems).toBeTruthy();
    expect(Array.isArray(res.body.details.problems)).toBe(true);
    expect(res.body.details.problems).toHaveLength(1);
    expect(res.body.details.problems[0]).toMatchObject({
      contentType: 'CAREER',
      contentId: fixture.contextId,
      revisionId: rev.id,
    });
    expect(res.body.details.problems[0].problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('skills.1: duplicate skillId'),
      ]),
    );

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.DRAFT);
    expect(session.submittedAt).toBeNull();

    const revision = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: rev.id },
    });
    expect(revision.status).toBe(RevisionStatus.DRAFT);
  });

  it('stays DRAFT on staleness (any stale revision blocks the whole session)', async () => {
    const fixture = await seedDraftWith({
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: cleanCareerSnapshot('Stale Title'),
          baseVersion: 1,
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
    // 2 publish events → currentVersion = 2, baseVersion = 1 → stale.
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    const res = await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(409);

    expect(res.body).toMatchObject({ code: 'SESSION_STALE' });
    expect(res.body.details?.stale).toBeTruthy();
    expect(res.body.details.stale.length).toBeGreaterThan(0);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.DRAFT);
    expect(session.submittedAt).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────
  // State machine
  // ───────────────────────────────────────────────────────────────────

  it('returns 409 INVALID_SESSION_STATE when the session is empty', async () => {
    const fixture = await seedDraftWith({ revisions: [] });

    const res = await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(409);
    expect(res.body.code).toBe('INVALID_SESSION_STATE');

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.DRAFT);
  });

  it.each([
    RevisionStatus.IN_REVIEW,
    RevisionStatus.APPROVED,
    RevisionStatus.REJECTED,
    RevisionStatus.CHANGES_REQUESTED,
    RevisionStatus.PUBLISHED,
  ])(
    'returns 409 INVALID_SESSION_STATE when the session is %s',
    async (status) => {
      const fixture = await seedDraftWith({
        status,
        revisions: [
          {
            contentType: 'CAREER',
            contentId: 'PLACEHOLDER',
            snapshot: cleanCareerSnapshot('X'),
            baseVersion: 0,
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

      const res = await submitApi(
        app,
        apiPrefix,
        users.tokens[Role.EDITOR],
        fixture.sessionId,
      ).expect(409);
      expect(res.body.code).toBe('INVALID_SESSION_STATE');
    },
  );

  // ───────────────────────────────────────────────────────────────────
  // Errors
  // ───────────────────────────────────────────────────────────────────

  it('returns 404 for an unknown session', async () => {
    const res = await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/not-a-uuid/submit`)
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedDraftWith({ revisions: [] });
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/submit`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedDraftWith({ revisions: [] });
    await submitApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
    ).expect(403);
  });
});
