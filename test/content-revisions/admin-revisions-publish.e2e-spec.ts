import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  CareerStatus,
  RevisionStatus,
  ReviewDecision,
  Role,
} from '../../src/generated/prisma/client';
import type { CareerSnapshot } from '../../src/catalog/content-revisions/career-snapshot.types';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('Admin revisions — publish (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const careerIds: string[] = [];
  const revisionIds: string[] = [];
  const marker = `e2e-publish-${Date.now()}`;

  const tokens = {} as Record<Role, string>;
  let publisherId: string;
  let adminId: string;
  let editorId: string;
  let reviewerId: string;
  let fieldId: string;
  let skillAId: string;
  let skillBId: string;

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

    for (const role of [
      Role.EDITOR,
      Role.REVIEWER,
      Role.PUBLISHER,
      Role.ADMIN,
    ]) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password: 'Password123!',
      });
      userIds.push(registered.id);
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password: 'Password123!' })
        .expect(200);
      tokens[role] = (login.body as { accessToken: string }).accessToken;
      if (role === Role.EDITOR) editorId = registered.id;
      if (role === Role.REVIEWER) reviewerId = registered.id;
      if (role === Role.PUBLISHER) publisherId = registered.id;
      if (role === Role.ADMIN) adminId = registered.id;
    }

    const field = await prisma.field.create({
      data: { name: `Field ${marker}`, slug: `field-${marker}` },
    });
    fieldId = field.id;
    const skillA = await prisma.skill.create({
      data: { name: `Skill A ${marker}` },
    });
    const skillB = await prisma.skill.create({
      data: { name: `Skill B ${marker}` },
    });
    skillAId = skillA.id;
    skillBId = skillB.id;
  });

  afterAll(async () => {
    await prisma.contentRevision.deleteMany({
      where: { id: { in: revisionIds } },
    });
    await prisma.review.deleteMany({
      where: { revisionId: { in: revisionIds } },
    });
    await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    await prisma.field.delete({ where: { id: fieldId } });
    await prisma.skill.deleteMany({
      where: { id: { in: [skillAId, skillBId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  // ────────────────────────────────────────────────────────────────────
  // Fixtures
  // ────────────────────────────────────────────────────────────────────

  type SeedCareerOptions = {
    version?: number;
    status?: CareerStatus;
    title?: string;
    withStep?: boolean;
    withLearnerProgress?: boolean;
  };

  const seedCareer = async (
    opts: SeedCareerOptions = {},
  ): Promise<{ careerId: string; stepId: string | null }> => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const career = await prisma.career.create({
      data: {
        title: opts.title ?? `Career ${marker} ${suffix}`,
        slug: `career-${marker}-${suffix}`,
        description: 'desc',
        roleSummary: 'summary',
        exampleActivities: [],
        fieldId,
        status: opts.status ?? CareerStatus.PUBLISHED,
        version: opts.version ?? 1,
        skills: {
          create: [{ skillId: skillAId, importance: 'REQUIRED' }],
        },
      },
    });
    careerIds.push(career.id);

    let stepId: string | null = null;
    if (opts.withStep ?? true) {
      const pathway = await prisma.pathway.create({
        data: {
          careerId: career.id,
          title: 'Pathway',
          steps: {
            create: [
              {
                title: 'Step 1',
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order: 1,
              },
            ],
          },
        },
        include: { steps: true },
      });
      stepId = pathway.steps[0].id;

      if (opts.withLearnerProgress) {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: editorId },
        });
        await prisma.userPathwayStep.create({
          data: {
            userId: user.id,
            pathwayStepId: stepId,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
      }
    }
    return { careerId: career.id, stepId };
  };

  const buildSnapshot = (
    career: { id: string; stepId: string | null; title: string },
    overrides: Partial<CareerSnapshot['career']> = {},
    stepOverrides: Partial<{ title: string; order: number }>[] = [],
  ): CareerSnapshot => {
    const steps: CareerSnapshot['steps'] = career.stepId
      ? [
          {
            id: career.stepId,
            order: stepOverrides[0]?.order ?? 1,
            title: stepOverrides[0]?.title ?? 'Step 1',
            description: null,
            learningObjective: 'lo',
            prerequisites: null,
            expectedActivity: 'ea',
            skillIds: [],
            resourceIds: [],
          },
        ]
      : [];
    return {
      schemaVersion: 1,
      career: {
        title: career.title,
        slug: `career-${marker}-${career.id.slice(0, 8)}`,
        description: 'desc',
        roleSummary: 'summary',
        fieldId,
        targetLevels: [],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
        ...overrides,
      },
      pathway: career.stepId ? { title: 'Pathway', description: null } : null,
      steps,
      skills: [{ skillId: skillAId, importance: 'REQUIRED' }],
      outlook: [],
      resources: [],
    };
  };

  const seedApprovedRevision = async (args: {
    careerId: string;
    baseVersion: number;
    snapshot: CareerSnapshot;
    editorId?: string;
    reviewerId?: string;
  }) => {
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: args.careerId,
        baseVersion: args.baseVersion,
        snapshot: args.snapshot as unknown as object,
        status: RevisionStatus.APPROVED,
        createdById: args.editorId ?? editorId,
      },
    });
    revisionIds.push(revision.id);

    await prisma.review.create({
      data: {
        revisionId: revision.id,
        reviewerId: args.reviewerId ?? reviewerId,
        decision: ReviewDecision.APPROVED,
        note: 'lgtm',
      },
    });

    return revision.id;
  };

  const publish = (revisionId: string, token = tokens[Role.PUBLISHER]) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/revisions/${revisionId}/publish`)
      .set('Authorization', `Bearer ${token}`);

  // ────────────────────────────────────────────────────────────────────
  // Happy path
  // ────────────────────────────────────────────────────────────────────

  it('publishes an approved revision and the live career matches the snapshot', async () => {
    const { careerId, stepId } = await seedCareer({ version: 2 });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    const snapshot = buildSnapshot(
      { id: careerId, stepId, title: career.title },
      { title: `${career.title} (updated)` },
      [{ title: 'Step 1 — revised' }],
    );

    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 2,
      snapshot,
    });

    const response = await publish(revisionId).expect(200);

    expect(response.body).toMatchObject({
      revisionId,
      careerId,
      revisionStatus: RevisionStatus.PUBLISHED,
      careerStatus: CareerStatus.PUBLISHED,
      newVersion: 3,
    });
    expect(response.body.publishedAt).toBeTruthy();

    const live = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
      include: {
        pathway: { include: { steps: true } },
      },
    });
    expect(live.version).toBe(3);
    expect(live.status).toBe(CareerStatus.PUBLISHED);
    expect(live.title).toBe(`${career.title} (updated)`);
    expect(live.publishedById).toBe(publisherId);
    expect(live.reviewedById).toBe(reviewerId);
    expect(live.publishedAt).toBeTruthy();
    expect(live.reviewedAt).toBeTruthy();
    expect(live.pathway?.steps).toHaveLength(1);
    expect(live.pathway?.steps[0].title).toBe('Step 1 — revised');

    const rev = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(rev.status).toBe(RevisionStatus.PUBLISHED);
  });

  it('allows an ADMIN to publish onto a retired career', async () => {
    const { careerId, stepId } = await seedCareer({
      version: 3,
      status: CareerStatus.RETIRED,
    });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    const snapshot = buildSnapshot({
      id: careerId,
      stepId,
      title: career.title,
    });
    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 3,
      snapshot,
    });

    const response = await publish(revisionId, tokens[Role.ADMIN]).expect(200);
    expect(response.body.careerStatus).toBe(CareerStatus.PUBLISHED);

    const live = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(live.status).toBe(CareerStatus.PUBLISHED);
    expect(live.version).toBe(4);
  });

  it('applies a step reorder without violating @@unique([pathwayId, order])', async () => {
    // Seed a career with two steps, snapshot swaps their order.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const career = await prisma.career.create({
      data: {
        title: `Career ${marker} ${suffix}`,
        slug: `career-${marker}-${suffix}`,
        description: 'desc',
        roleSummary: 'summary',
        exampleActivities: [],
        fieldId,
        status: CareerStatus.PUBLISHED,
        version: 1,
        skills: { create: [{ skillId: skillAId, importance: 'REQUIRED' }] },
        pathway: {
          create: {
            title: 'Pathway',
            steps: {
              create: [
                {
                  title: 'Step A',
                  learningObjective: 'lo',
                  expectedActivity: 'ea',
                  order: 1,
                },
                {
                  title: 'Step B',
                  learningObjective: 'lo',
                  expectedActivity: 'ea',
                  order: 2,
                },
              ],
            },
          },
        },
      },
      include: {
        pathway: { include: { steps: { orderBy: { order: 'asc' } } } },
      },
    });
    careerIds.push(career.id);
    const [stepA, stepB] = career.pathway!.steps;

    const snapshot: CareerSnapshot = {
      schemaVersion: 1,
      career: {
        title: career.title,
        slug: career.slug,
        description: 'desc',
        roleSummary: 'summary',
        fieldId,
        targetLevels: [],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: { title: 'Pathway', description: null },
      steps: [
        {
          id: stepA.id,
          order: 2,
          title: 'Step A',
          description: null,
          learningObjective: 'lo',
          prerequisites: null,
          expectedActivity: 'ea',
          skillIds: [],
          resourceIds: [],
        },
        {
          id: stepB.id,
          order: 1,
          title: 'Step B',
          description: null,
          learningObjective: 'lo',
          prerequisites: null,
          expectedActivity: 'ea',
          skillIds: [],
          resourceIds: [],
        },
      ],
      skills: [{ skillId: skillAId, importance: 'REQUIRED' }],
      outlook: [],
      resources: [],
    };

    const revisionId = await seedApprovedRevision({
      careerId: career.id,
      baseVersion: 1,
      snapshot,
    });

    await publish(revisionId).expect(200);

    const after = await prisma.pathway.findUniqueOrThrow({
      where: { careerId: career.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    expect(after.steps.map((s) => s.title)).toEqual(['Step B', 'Step A']);
  });

  // ────────────────────────────────────────────────────────────────────
  // Failure paths (nothing changes)
  // ────────────────────────────────────────────────────────────────────

  it('409 REVISION_STALE when baseVersion ≠ live version; nothing changes', async () => {
    const { careerId, stepId } = await seedCareer({ version: 4 });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    const snapshot = buildSnapshot({
      id: careerId,
      stepId,
      title: career.title,
    });

    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 2,
      snapshot,
    });

    const response = await publish(revisionId).expect(409);
    expect(response.body.code).toBe('REVISION_STALE');
    expect(response.body.details).toEqual({
      baseVersion: 2,
      liveVersion: 4,
    });

    const live = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(live.version).toBe(4);
    expect(live.publishedAt).toBeNull();

    const rev = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(rev.status).toBe(RevisionStatus.APPROVED);
  });

  it('409 STEP_HAS_PROGRESS when removing a step with learners; nothing changes', async () => {
    const { careerId, stepId } = await seedCareer({
      version: 1,
      withStep: true,
      withLearnerProgress: true,
    });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    // Snapshot has no steps → plan wants to delete step with progress.
    const snapshot: CareerSnapshot = {
      schemaVersion: 1,
      career: {
        title: career.title,
        slug: career.slug,
        description: 'desc',
        roleSummary: 'summary',
        fieldId,
        targetLevels: [],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: { title: 'Pathway', description: null },
      steps: [],
      skills: [{ skillId: skillAId, importance: 'REQUIRED' }],
      outlook: [],
      resources: [],
    };

    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 1,
      snapshot,
    });

    const response = await publish(revisionId).expect(409);
    expect(response.body.code).toBe('STEP_HAS_PROGRESS');
    expect(response.body.details).toMatchObject({
      stepId,
      learnersAffected: 1,
    });

    const live = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(live.version).toBe(1);
    expect(live.publishedAt).toBeNull();
  });

  it('409 INVALID_REVISION_STATE for a non-APPROVED revision', async () => {
    const { careerId, stepId } = await seedCareer({ version: 1 });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    const snapshot = buildSnapshot({
      id: careerId,
      stepId,
      title: career.title,
    });
    const revision = await prisma.contentRevision.create({
      data: {
        careerId,
        baseVersion: 1,
        snapshot: snapshot as unknown as object,
        status: RevisionStatus.IN_REVIEW,
        createdById: editorId,
      },
    });
    revisionIds.push(revision.id);

    const response = await publish(revision.id).expect(409);
    expect(response.body.code).toBe('INVALID_REVISION_STATE');
  });

  it('409 CAREER_RETIRED for a non-ADMIN publisher', async () => {
    const { careerId, stepId } = await seedCareer({
      version: 1,
      status: CareerStatus.RETIRED,
    });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    const snapshot = buildSnapshot({
      id: careerId,
      stepId,
      title: career.title,
    });
    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 1,
      snapshot,
    });

    const response = await publish(revisionId).expect(409);
    expect(response.body.code).toBe('CAREER_RETIRED');
  });

  it('404 for an unknown revision', async () => {
    await publish('00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('401 without a token', async () => {
    await request(app.getHttpServer())
      .post(
        `${apiPrefix}/admin/revisions/00000000-0000-4000-8000-000000000000/publish`,
      )
      .expect(401);
  });

  it('403 for a REVIEWER (below PUBLISHER)', async () => {
    const { careerId, stepId } = await seedCareer({ version: 1 });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    const snapshot = buildSnapshot({
      id: careerId,
      stepId,
      title: career.title,
    });
    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 1,
      snapshot,
    });

    await publish(revisionId, tokens[Role.REVIEWER]).expect(403);
  });

  // ────────────────────────────────────────────────────────────────────
  // Rollback — the whole reason for the transaction
  // ────────────────────────────────────────────────────────────────────

  it('rolls back everything when a write fails midway', async () => {
    // Two careers. Publishing career A with a snapshot that tries to set A.title = B.title
    // → unique violation on Career.title inside the transaction.
    const { careerId: bId } = await seedCareer({ version: 1, withStep: false });
    const careerB = await prisma.career.findUniqueOrThrow({
      where: { id: bId },
    });

    const { careerId, stepId } = await seedCareer({ version: 1 });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    const snapshot = buildSnapshot(
      { id: careerId, stepId, title: career.title },
      { title: careerB.title, slug: career.slug },
      [{ title: 'Step 1 — should not persist' }],
    );
    const revisionId = await seedApprovedRevision({
      careerId,
      baseVersion: 1,
      snapshot,
    });

    const response = await publish(revisionId).expect(500);
    // The filter emits 500 for unhandled Prisma errors

    // Nothing committed.
    const live = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
      include: { pathway: { include: { steps: true } } },
    });
    expect(live.title).toBe(career.title);
    expect(live.version).toBe(1);
    expect(live.publishedAt).toBeNull();
    expect(live.pathway?.steps[0].title).toBe('Step 1');

    const rev = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(rev.status).toBe(RevisionStatus.APPROVED);
  });
});
