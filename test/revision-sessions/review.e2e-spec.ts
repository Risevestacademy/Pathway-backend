import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { AnalyticsService } from '../../src/analytics';
import {
  ReviewDecision,
  RevisionStatus,
  Role,
} from '../../src/generated/prisma/client';

import { notificationMock, wireNotificationMock } from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { reviewApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('POST /admin/sessions/:id/review — review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;
  let captureSpy: jest.SpiedFunction<AnalyticsService['capture']>;

  const marker = `e2e-review-${Date.now()}`;
  const fixtures: SessionFixture[] = [];

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

  const seedInReview = async (
    opts: {
      createdById?: string;
      baseVersion?: number;
    } = {},
  ) => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-${fixtures.length}`,
      createdById: opts.createdById ?? users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: RevisionStatus.IN_REVIEW,
      submittedAt: new Date(),
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: cleanCareerSnapshot('Reviewable Title'),
          baseVersion: opts.baseVersion ?? 0,
          status: RevisionStatus.IN_REVIEW,
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
      roles: [Role.USER, Role.EDITOR, Role.REVIEWER, Role.ADMIN],
    });

    // Spy on analytics so we can assert the note is never sent.
    const analytics = app.get(AnalyticsService);
    captureSpy = jest.spyOn(analytics, 'capture');
  });

  afterAll(async () => {
    captureSpy.mockRestore();
    try {
      for (const f of fixtures) await cleanupSession(prisma, f).catch(() => {});
      await users.cleanup().catch(() => {});
    } finally {
      await app.close();
    }
  });

  // Reset the spy's call history between tests, but keep the spy installed.
  beforeEach(() => {
    captureSpy.mockClear();
  });

  // ───────────────────────────────────────────────────────────────────
  // Happy paths
  // ───────────────────────────────────────────────────────────────────

  it('APPROVED: transitions session + revisions, creates Review row, does NOT publish', async () => {
    const fixture = await seedInReview();

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED, note: 'Looks good.' },
    ).expect(201);

    expect(res.body).toMatchObject({
      revisionId: null,
      decision: ReviewDecision.APPROVED,
      note: 'Looks good.',
      sessionStatus: RevisionStatus.APPROVED,
    });
    expect(typeof res.body.reviewId).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');

    // Session + revision transitioned.
    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.APPROVED);

    const revision = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId },
    });
    expect(revision.status).toBe(RevisionStatus.APPROVED);

    // Review row exists, session-scoped.
    const review = await prisma.review.findUniqueOrThrow({
      where: { id: res.body.reviewId },
    });
    expect(review.revisionId).toBeNull();
    expect(review.sessionId).toBe(fixture.sessionId);
    expect(review.reviewerId).toBe(users.ids[Role.REVIEWER]);
    expect(review.decision).toBe(ReviewDecision.APPROVED);
    expect(review.note).toBe('Looks good.');

    // Approved does NOT publish.
    expect(session.publishedAt).toBeNull();
    const events = await prisma.contentRevisionPublishEvent.count({
      where: { contentId: fixture.contextId },
    });
    expect(events).toBe(0);
  });

  it('CHANGES_REQUESTED: transitions + persists note', async () => {
    const fixture = await seedInReview();

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      {
        decision: ReviewDecision.CHANGES_REQUESTED,
        note: 'Fix the salary range.',
      },
    ).expect(201);

    expect(res.body.sessionStatus).toBe(RevisionStatus.CHANGES_REQUESTED);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.CHANGES_REQUESTED);

    const review = await prisma.review.findUniqueOrThrow({
      where: { id: res.body.reviewId },
    });
    expect(review.decision).toBe(ReviewDecision.CHANGES_REQUESTED);
    expect(review.note).toBe('Fix the salary range.');
  });

  it('REJECTED: transitions + persists note', async () => {
    const fixture = await seedInReview();

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.REJECTED, note: 'Wrong approach.' },
    ).expect(201);

    expect(res.body.sessionStatus).toBe(RevisionStatus.REJECTED);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.REJECTED);
  });

  it('allows a review without a note', async () => {
    const fixture = await seedInReview();

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(201);

    expect(res.body.note).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────
  // Separation of duties
  // ───────────────────────────────────────────────────────────────────

  it('blocks self-review by an EDITOR (creator = reviewer)', async () => {
    // The EDITOR created this session. They try to review it as REVIEWER —
    // but registerRoles gives each role a distinct user, so we need a
    // creator who is also a reviewer. Seed the session with the REVIEWER
    // user as creator.
    const fixture = await seedInReview({
      createdById: users.ids[Role.REVIEWER],
    });

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(403);
    expect(res.body.code).toBe('SELF_REVIEW_NOT_ALLOWED');

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.IN_REVIEW);
  });

  it('allows an ADMIN to self-review', async () => {
    const fixture = await seedInReview({ createdById: users.ids[Role.ADMIN] });

    await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.ADMIN],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(201);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.APPROVED);
  });

  // ───────────────────────────────────────────────────────────────────
  // Staleness
  // ───────────────────────────────────────────────────────────────────

  it('blocks APPROVED on a stale session with 409 SESSION_STALE; nothing transitions', async () => {
    const fixture = await seedInReview({ baseVersion: 1 });
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(409);
    expect(res.body.code).toBe('SESSION_STALE');

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.IN_REVIEW);

    const reviewCount = await prisma.review.count({
      where: { sessionId: fixture.sessionId },
    });
    expect(reviewCount).toBe(0);
  });

  it('allows REJECTED on a stale session (rejection is always allowed)', async () => {
    const fixture = await seedInReview({ baseVersion: 1 });
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.REJECTED },
    ).expect(201);
  });

  it('allows CHANGES_REQUESTED on a stale session', async () => {
    const fixture = await seedInReview({ baseVersion: 1 });
    await prisma.contentRevisionPublishEvent.createMany({
      data: [
        { contentType: 'CAREER', contentId: fixture.contextId },
        { contentType: 'CAREER', contentId: fixture.contextId },
      ],
    });

    await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
      { decision: ReviewDecision.CHANGES_REQUESTED },
    ).expect(201);
  });

  // ───────────────────────────────────────────────────────────────────
  // State machine
  // ───────────────────────────────────────────────────────────────────

  it.each([
    RevisionStatus.DRAFT,
    RevisionStatus.APPROVED,
    RevisionStatus.REJECTED,
    RevisionStatus.CHANGES_REQUESTED,
    RevisionStatus.PUBLISHED,
  ])(
    'returns 409 INVALID_SESSION_STATE when the session is %s',
    async (status) => {
      const fixture = await seedSession(prisma, {
        marker: `${marker}-${status}`,
        createdById: users.ids[Role.EDITOR],
        contextId: null,
        createCareer: true,
        status,
        revisions: [
          {
            contentType: 'CAREER',
            contentId: 'PLACEHOLDER',
            snapshot: cleanCareerSnapshot('X'),
            baseVersion: 0,
            status,
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

      const res = await reviewApi(
        app,
        apiPrefix,
        users.tokens[Role.REVIEWER],
        fixture.sessionId,
        { decision: ReviewDecision.APPROVED },
      ).expect(409);
      expect(res.body.code).toBe('INVALID_SESSION_STATE');
    },
  );

  // ───────────────────────────────────────────────────────────────────
  // Analytics
  // ───────────────────────────────────────────────────────────────────

  it('emits revision_session_reviewed with decision but NEVER the note', async () => {
    const fixture = await seedInReview();
    const distinctiveNote = `SECRET-NOTE-${Date.now()}-do-not-log`;

    const analytics = app.get(AnalyticsService);
    const spy = jest.spyOn(analytics, 'capture');

    try {
      await reviewApi(
        app,
        apiPrefix,
        users.tokens[Role.REVIEWER],
        fixture.sessionId,
        { decision: ReviewDecision.APPROVED, note: distinctiveNote },
      ).expect(201);

      const calls = (spy.mock.calls as unknown[][]).filter(
        (c) => c[0] === 'revision_session_reviewed',
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);

      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe('revision_session_reviewed');
      expect(lastCall[1]).toBe(users.ids[Role.REVIEWER]);

      const props = lastCall[2] as { decision: string; sessionId: string };
      expect(props.decision).toBe(ReviewDecision.APPROVED);
      expect(props.sessionId).toBe(fixture.sessionId);
      expect(JSON.stringify(props)).not.toContain(distinctiveNote);
    } finally {
      spy.mockRestore();
    }
  });
  // ───────────────────────────────────────────────────────────────────
  // Errors
  // ───────────────────────────────────────────────────────────────────

  it('returns 404 for an unknown session', async () => {
    const res = await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      '00000000-0000-4000-8000-000000000000',
      { decision: ReviewDecision.APPROVED },
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/not-a-uuid/review`)
      .set('Authorization', `Bearer ${users.tokens[Role.REVIEWER]}`)
      .send({ decision: ReviewDecision.APPROVED })
      .expect(400);
  });

  it('returns 400 for an invalid decision value', async () => {
    const fixture = await seedInReview();
    const res = await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/review`)
      .set('Authorization', `Bearer ${users.tokens[Role.REVIEWER]}`)
      .send({ decision: 'NOT_A_DECISION' })
      .expect(400);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 400 when note exceeds 2000 chars', async () => {
    const fixture = await seedInReview();
    const res = await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/review`)
      .set('Authorization', `Bearer ${users.tokens[Role.REVIEWER]}`)
      .send({
        decision: ReviewDecision.APPROVED,
        note: 'x'.repeat(2001),
      })
      .expect(400);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 401 without a token', async () => {
    const fixture = await seedInReview();
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/review`)
      .send({ decision: ReviewDecision.APPROVED })
      .expect(401);
  });

  it('returns 403 to an EDITOR (below REVIEWER)', async () => {
    const fixture = await seedInReview();
    await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(403);
  });

  it('returns 403 to a USER', async () => {
    const fixture = await seedInReview();
    await reviewApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      fixture.sessionId,
      { decision: ReviewDecision.APPROVED },
    ).expect(403);
  });
});
