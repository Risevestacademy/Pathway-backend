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

import { notificationMock, wireNotificationMock } from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { publishApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('POST /admin/sessions/:id/publish — publish (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-publish-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const seededFieldIds: string[] = [];
  const seededSkillIds: string[] = [];
  const seededCareerIds: string[] = [];

  const seedFieldAndSkill = async (suffix: string) => {
    const field = await prisma.field.create({
      data: {
        name: `Field ${marker}-${suffix}`,
        slug: `field-${marker}-${suffix}`,
      },
    });
    seededFieldIds.push(field.id);
    const skill = await prisma.skill.create({
      data: { name: `Skill ${marker}-${suffix}` },
    });
    seededSkillIds.push(skill.id);
    return { fieldId: field.id, skillId: skill.id };
  };

  const cleanCareerSnapshot = (opts: {
    title: string;
    fieldId: string;
    skillId: string;
  }) => ({
    career: {
      title: opts.title,
      slug: opts.title.toLowerCase().replace(/\s+/g, '-'),
      description: 'A description.',
      roleSummary: 'What the role involves.',
      fieldId: opts.fieldId,
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
        skillIds: [opts.skillId],
        resourceIds: [],
      },
    ],
    skills: [{ skillId: opts.skillId, importance: 'REQUIRED' as const }],
    outlook: [],
    resources: [],
  });

  // Seeds a session whose Career was created by createSession (createdCareer: true).
  //
  // Returns the fixture plus the title that publish will write, so the test can
  // assert on it without duplicating the string. Title/slug are unique per
  // fixture — Career.title and Career.slug are @unique, and using a fixed
  // value across two fixtures in the same suite violates the constraint on the
  // second publish.
  const seedApprovedNewCareer = async (opts: { baseVersion?: number } = {}) => {
    const index = fixtures.length;
    const { fieldId, skillId } = await seedFieldAndSkill(`new-${index}`);
    const publishedTitle = `Published Title ${marker}-${index}`;

    const fixture = await seedSession(prisma, {
      marker: `${marker}-new-${index}`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      createdCareer: true,
      status: RevisionStatus.APPROVED,
      submittedAt: new Date(),
      revisions: [
        {
          contentType: 'CAREER',
          contentId: 'PLACEHOLDER',
          snapshot: cleanCareerSnapshot({
            title: publishedTitle,
            fieldId,
            skillId,
          }),
          baseVersion: opts.baseVersion ?? 0,
          status: RevisionStatus.APPROVED,
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
    return { fixture, publishedTitle };
  };

  // Seeds a session whose Career was created before the session
  // (createdCareer: false). The Career is a PUBLISHED row with version 1,
  // and the session edits it.
  //
  // Returns the fixture, the career id, the original title (for pre-publish
  // assertions), and the title publish will write (for post-publish assertions).
  // Original title and slug are unique per fixture — Career.title and
  // Career.slug are @unique, and fixed values across fixtures break on the
  // second seed.
  const seedApprovedExistingCareer = async (
    opts: { baseVersion?: number } = {},
  ) => {
    const index = fixtures.length;
    const { fieldId, skillId } = await seedFieldAndSkill(`existing-${index}`);

    const originalTitle = `Existing ${marker}-${index}`;
    const originalSlug = `existing-${marker}-${index}`;
    const updatedTitle = `Updated Existing Title ${marker}-${index}`;

    const career = await prisma.career.create({
      data: {
        slug: originalSlug,
        title: originalTitle,
        description: 'original',
        roleSummary: 'original',
        exampleActivities: [],
        fieldId,
        status: CareerStatus.PUBLISHED,
        version: 1,
      },
    });
    seededCareerIds.push(career.id);

    const fixture = await seedSession(prisma, {
      marker: `${marker}-existing-${index}`,
      createdById: users.ids[Role.EDITOR],
      contextId: career.id,
      createCareer: false,
      createdCareer: false,
      status: RevisionStatus.APPROVED,
      submittedAt: new Date(),
      revisions: [
        {
          contentType: 'CAREER',
          contentId: career.id,
          snapshot: cleanCareerSnapshot({
            title: updatedTitle,
            fieldId,
            skillId,
          }),
          baseVersion: opts.baseVersion ?? 0,
          status: RevisionStatus.APPROVED,
        },
      ],
    });
    fixtures.push(fixture);
    return { fixture, careerId: career.id, originalTitle, updatedTitle };
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
      roles: [Role.USER, Role.EDITOR, Role.REVIEWER, Role.PUBLISHER],
    });
  });

  afterAll(async () => {
    try {
      for (const f of fixtures) await cleanupSession(prisma, f).catch(() => {});
      if (seededCareerIds.length > 0) {
        await prisma.career
          .deleteMany({ where: { id: { in: seededCareerIds } } })
          .catch(() => {});
      }
      if (seededSkillIds.length > 0) {
        await prisma.skill
          .deleteMany({ where: { id: { in: seededSkillIds } } })
          .catch(() => {});
      }
      if (seededFieldIds.length > 0) {
        await prisma.field
          .deleteMany({ where: { id: { in: seededFieldIds } } })
          .catch(() => {});
      }
      await users.cleanup().catch(() => {});
    } finally {
      await app.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // createdCareer: true (new career)
  // ───────────────────────────────────────────────────────────────────

  it('publishes a createdCareer session: updates Career, promotes to PUBLISHED, bumps version, writes event', async () => {
    const { fixture, publishedTitle } = await seedApprovedNewCareer();

    const res = await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.PUBLISHER],
      fixture.sessionId,
    ).expect(200);

    expect(res.body).toMatchObject({
      sessionId: fixture.sessionId,
      status: RevisionStatus.PUBLISHED,
    });
    expect(res.body.publishedAt).toBeTruthy();
    expect(res.body.idMap).toBeDefined();
    expect(Array.isArray(res.body.published)).toBe(true);
    expect(res.body.published).toHaveLength(1);
    expect(res.body.published[0]).toMatchObject({
      contentType: 'CAREER',
      contentId: fixture.contextId,
    });

    const career = await prisma.career.findUniqueOrThrow({
      where: { id: fixture.contextId },
    });
    expect(career.title).toBe(publishedTitle);
    expect(career.status).toBe(CareerStatus.PUBLISHED);
    expect(career.version).toBe(2); // 1 → 2

    const events = await prisma.contentRevisionPublishEvent.count({
      where: { contentType: 'CAREER', contentId: fixture.contextId },
    });
    expect(events).toBe(1);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.PUBLISHED);
    expect(session.publishedAt).not.toBeNull();

    const revision = await prisma.contentRevision.findFirstOrThrow({
      where: { sessionId: fixture.sessionId },
    });
    expect(revision.status).toBe(RevisionStatus.PUBLISHED);
    expect(revision.publishedAt).not.toBeNull();
  });

  it('publishes a createdCareer session with a new pathway and step (temp step id in idMap)', async () => {
    const { fixture } = await seedApprovedNewCareer();

    const res = await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.PUBLISHER],
      fixture.sessionId,
    ).expect(200);

    const pathway = await prisma.pathway.findUnique({
      where: { careerId: fixture.contextId },
      include: { steps: true },
    });
    expect(pathway).not.toBeNull();
    expect(pathway!.steps).toHaveLength(1);

    expect(res.body.idMap['new-step-1']).toBeTruthy();
    expect(pathway!.steps[0].id).toBe(res.body.idMap['new-step-1']);
  });

  // ───────────────────────────────────────────────────────────────────
  // createdCareer: false (existing career)
  // ───────────────────────────────────────────────────────────────────

  it('publishes a createdCareer:false session: updates the existing Career, keeps status PUBLISHED, bumps version, writes event', async () => {
    const { fixture, careerId, originalTitle, updatedTitle } =
      await seedApprovedExistingCareer();

    const before = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(before.title).toBe(originalTitle);
    expect(before.version).toBe(1);
    expect(before.status).toBe(CareerStatus.PUBLISHED);

    const res = await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.PUBLISHER],
      fixture.sessionId,
    ).expect(200);

    expect(res.body).toMatchObject({
      sessionId: fixture.sessionId,
      status: RevisionStatus.PUBLISHED,
    });
    expect(res.body.published).toHaveLength(1);
    expect(res.body.published[0]).toMatchObject({
      contentType: 'CAREER',
      contentId: careerId,
    });

    const after = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(after.title).toBe(updatedTitle);
    expect(after.version).toBe(2); // 1 → 2 (unconditional bump)
    expect(after.status).toBe(CareerStatus.PUBLISHED); // unchanged (was already PUBLISHED)

    const events = await prisma.contentRevisionPublishEvent.count({
      where: { contentType: 'CAREER', contentId: careerId },
    });
    expect(events).toBe(1);

    const session = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe(RevisionStatus.PUBLISHED);
  });

  // ───────────────────────────────────────────────────────────────────
  // Staleness
  // ───────────────────────────────────────────────────────────────────

  //   it('returns 409 SESSION_STALE and writes nothing when a revision is stale', async () => {
  //     const { fixture } = await seedApprovedNewCareer({ baseVersion: 1 });
  //     await prisma.contentRevisionPublishEvent.createMany({
  //       data: [
  //         { contentType: 'CAREER', contentId: fixture.contextId },
  //         { contentType: 'CAREER', contentId: fixture.contextId },
  //       ],
  //     });

  //     const careerBefore = await prisma.career.findUniqueOrThrow({
  //       where: { id: fixture.contextId },
  //     });

  //     const res = await publishApi(
  //       app,
  //       apiPrefix,
  //       users.tokens[Role.PUBLISHER],
  //       fixture.sessionId,
  //     ).expect(409);
  //     expect(res.body.code).toBe('SESSION_STALE');

  //     const careerAfter = await prisma.career.findUniqueOrThrow({
  //       where: { id: fixture.contextId },
  //     });
  //     expect(careerAfter.title).toBe(careerBefore.title);
  //     expect(careerAfter.version).toBe(careerBefore.version); // no bump on failure

  //     const session = await prisma.revisionSession.findUniqueOrThrow({
  //       where: { id: fixture.sessionId },
  //     });
  //     expect(session.status).toBe(RevisionStatus.APPROVED);

  //     const events = await prisma.contentRevisionPublishEvent.count({
  //       where: { contentType: 'CAREER', contentId: fixture.contextId },
  //     });
  //     expect(events).toBe(2); // the 2 seeded, none added
  //   });

  // ───────────────────────────────────────────────────────────────────
  // State machine
  // ───────────────────────────────────────────────────────────────────

  it.each([
    RevisionStatus.DRAFT,
    RevisionStatus.IN_REVIEW,
    RevisionStatus.REJECTED,
    RevisionStatus.CHANGES_REQUESTED,
    RevisionStatus.PUBLISHED,
  ])(
    'returns 409 INVALID_SESSION_STATE when the session is %s',
    async (status) => {
      const { fieldId, skillId } = await seedFieldAndSkill(`state-${status}`);
      const fixture = await seedSession(prisma, {
        marker: `${marker}-state-${status}`,
        createdById: users.ids[Role.EDITOR],
        contextId: null,
        createCareer: true,
        createdCareer: true,
        status,
        revisions: [
          {
            contentType: 'CAREER',
            contentId: 'PLACEHOLDER',
            snapshot: cleanCareerSnapshot({ title: 'X', fieldId, skillId }),
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

      const res = await publishApi(
        app,
        apiPrefix,
        users.tokens[Role.PUBLISHER],
        fixture.sessionId,
      ).expect(409);
      expect(res.body.code).toBe('INVALID_SESSION_STATE');
    },
  );

  it('returns 409 INVALID_SESSION_STATE for an empty session', async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-empty`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      createdCareer: true,
      status: RevisionStatus.APPROVED,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.PUBLISHER],
      fixture.sessionId,
    ).expect(409);
    expect(res.body.code).toBe('INVALID_SESSION_STATE');
  });

  // ───────────────────────────────────────────────────────────────────
  // Authorization / errors
  // ───────────────────────────────────────────────────────────────────

  it('returns 403 to a REVIEWER (below PUBLISHER)', async () => {
    const { fixture } = await seedApprovedNewCareer();
    await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      fixture.sessionId,
    ).expect(403);
  });

  it('returns 403 to an EDITOR (below PUBLISHER)', async () => {
    const { fixture } = await seedApprovedNewCareer();
    await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      fixture.sessionId,
    ).expect(403);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await publishApi(
      app,
      apiPrefix,
      users.tokens[Role.PUBLISHER],
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 for a non-UUID sessionId', async () => {
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/not-a-uuid/publish`)
      .set('Authorization', `Bearer ${users.tokens[Role.PUBLISHER]}`)
      .expect(400);
  });

  it('returns 401 without a token', async () => {
    const { fixture } = await seedApprovedNewCareer();
    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions/${fixture.sessionId}/publish`)
      .expect(401);
  });
});
