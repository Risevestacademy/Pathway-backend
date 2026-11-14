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
  Role,
} from '../../src/generated/prisma/client';
import type { CareerSnapshot } from '../../src/catalog/content-revisions/career-snapshot.types';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('Admin revisions — submit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const ids = {} as Record<Role, string>;
  const tokens = {} as Record<Role, string>;
  const careerIds: string[] = [];
  let fieldId: string;
  let skillId: string;
  let sequence = 0;

  const password = 'Password123!';
  const marker = `e2e-submit-${Date.now()}`;
  const LIVE_VERSION = 2;

  const step = (id: string, order: number) => ({
    id,
    order,
    title: `Step ${order}`,
    description: null,
    learningObjective: 'lo',
    prerequisites: null,
    expectedActivity: 'ea',
    skillIds: [],
    resourceIds: [],
  });

  const readySnapshot = (key: string, steps = [step('new-1', 1)]) =>
    ({
      schemaVersion: 1,
      career: {
        title: key,
        slug: key,
        description: 'd',
        roleSummary: 'r',
        fieldId,
        targetLevels: [],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: { title: `Pathway ${key}`, description: null },
      steps,
      skills: [{ skillId, importance: 'REQUIRED' }],
      outlook: [],
      resources: [],
    }) as CareerSnapshot;

  const seedRevision = async (
    options: {
      status?: RevisionStatus;
      careerStatus?: CareerStatus;
      snapshot?: (key: string) => CareerSnapshot;
      baseVersion?: number;
    } = {},
  ) => {
    const key = `${marker}-${sequence++}`;
    const career = await prisma.career.create({
      data: {
        slug: key,
        title: key,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        status: options.careerStatus ?? CareerStatus.PUBLISHED,
        version: LIVE_VERSION,
      },
    });
    careerIds.push(career.id);
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: career.id,
        baseVersion: options.baseVersion ?? LIVE_VERSION,
        snapshot: (options.snapshot ?? readySnapshot)(key) as unknown as object,
        status: options.status ?? RevisionStatus.DRAFT,
        createdById: ids[Role.EDITOR],
      },
    });
    return { careerId: career.id, revisionId: revision.id, key };
  };

  const submit = (revisionId: string, role: Role = Role.EDITOR) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/revisions/${revisionId}/submit`)
      .set('Authorization', `Bearer ${tokens[role]}`);

  const statusOf = async (revisionId: string) =>
    (
      await prisma.contentRevision.findUniqueOrThrow({
        where: { id: revisionId },
        select: { status: true },
      })
    ).status;

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

    const field = await prisma.field.create({
      data: { name: `Field ${marker}`, slug: `field-${marker}` },
    });
    fieldId = field.id;
    const skill = await prisma.skill.create({
      data: { name: `Skill ${marker}` },
    });
    skillId = skill.id;

    for (const role of Object.values(Role)) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds.push(registered.id);
      ids[role] = registered.id;
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password })
        .expect(200);
      tokens[role] = (login.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await prisma.contentRevision.deleteMany({
      where: { careerId: { in: careerIds } },
    });
    await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    await prisma.skill.deleteMany({ where: { id: skillId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('moves a ready draft to IN_REVIEW', async () => {
    const { revisionId, careerId } = await seedRevision();

    const response = await submit(revisionId).expect(200);

    expect(response.body).toMatchObject({
      id: revisionId,
      careerId,
      status: RevisionStatus.IN_REVIEW,
      baseVersion: LIVE_VERSION,
    });
    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.IN_REVIEW);
  });

  it('submits a stale draft', async () => {
    const { revisionId } = await seedRevision({
      baseVersion: LIVE_VERSION - 1,
    });

    await submit(revisionId).expect(200);

    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.IN_REVIEW);
  });

  it('returns 400 REVISION_NOT_READY listing each failing rule and keeps the draft', async () => {
    const { revisionId } = await seedRevision({
      snapshot: (key) => ({
        ...readySnapshot(key),
        career: { ...readySnapshot(key).career, roleSummary: null },
        steps: [],
        skills: [],
      }),
    });

    const response = await submit(revisionId).expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'BAD_REQUEST',
      code: 'REVISION_NOT_READY',
    });
    const { blockers } = (
      response.body as { details: { blockers: { code: string }[] } }
    ).details;
    expect(blockers.map((b) => b.code).sort()).toEqual([
      'MISSING_CAREER_FIELD',
      'NO_PATHWAY_STEPS',
      'NO_SKILLS',
    ]);
    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.DRAFT);
  });

  it('returns 400 STEP_HAS_PROGRESS when the draft removes a step learners completed', async () => {
    const { revisionId, careerId } = await seedRevision();
    const pathway = await prisma.pathway.create({
      data: {
        careerId,
        title: 'Live pathway',
        steps: {
          create: [1, 2].map((order) => ({
            title: `Live step ${order}`,
            learningObjective: 'lo',
            expectedActivity: 'ea',
            order,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    const [kept, removed] = pathway.steps;
    await prisma.userPathwayStep.create({
      data: {
        userId: ids[Role.USER],
        pathwayStepId: removed.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    const draft = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    const snapshot = draft.snapshot as unknown as CareerSnapshot;
    await prisma.contentRevision.update({
      where: { id: revisionId },
      data: {
        snapshot: {
          ...snapshot,
          steps: [step(kept.id, 1)],
        } as unknown as object,
      },
    });

    const response = await submit(revisionId).expect(400);

    expect(response.body.code).toBe('REVISION_NOT_READY');
    const { blockers } = (
      response.body as {
        details: {
          blockers: {
            code: string;
            entityId?: string;
            learnersAffected?: number;
          }[];
        };
      }
    ).details;
    expect(blockers).toEqual([
      expect.objectContaining({
        code: 'STEP_HAS_PROGRESS',
        entityId: removed.id,
        learnersAffected: 1,
      }),
    ]);
    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.DRAFT);
  });

  it.each([
    RevisionStatus.IN_REVIEW,
    RevisionStatus.APPROVED,
    RevisionStatus.REJECTED,
  ])('returns 409 INVALID_REVISION_STATE for a %s revision', async (status) => {
    const { revisionId } = await seedRevision({ status });

    const response = await submit(revisionId).expect(409);

    expect(response.body).toMatchObject({
      error: 'CONFLICT',
      code: 'INVALID_REVISION_STATE',
    });
    await expect(statusOf(revisionId)).resolves.toBe(status);
  });

  it('returns 409 CAREER_RETIRED when an EDITOR submits on a retired career', async () => {
    const { revisionId } = await seedRevision({
      careerStatus: CareerStatus.RETIRED,
    });

    const response = await submit(revisionId).expect(409);

    expect(response.body).toMatchObject({
      error: 'CONFLICT',
      code: 'CAREER_RETIRED',
    });
    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.DRAFT);
  });

  it('lets an ADMIN submit on a retired career', async () => {
    const { revisionId } = await seedRevision({
      careerStatus: CareerStatus.RETIRED,
    });

    await submit(revisionId, Role.ADMIN).expect(200);

    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.IN_REVIEW);
  });

  it('returns 404 for an unknown revision', async () => {
    await submit('00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    await submit('revision-1').expect(400);
  });

  it('returns 401 without an access token', async () => {
    const { revisionId } = await seedRevision();

    await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/revisions/${revisionId}/submit`)
      .expect(401);
  });

  it('returns 403 to a USER and leaves the draft', async () => {
    const { revisionId } = await seedRevision();

    const response = await submit(revisionId, Role.USER).expect(403);

    expect(response.body.error).toBe('FORBIDDEN');
    await expect(statusOf(revisionId)).resolves.toBe(RevisionStatus.DRAFT);
  });

  it.each([Role.REVIEWER, Role.PUBLISHER, Role.ADMIN])(
    'lets a %s submit a draft',
    async (role) => {
      const { revisionId } = await seedRevision();

      await submit(revisionId, role).expect(200);
    },
  );
});
