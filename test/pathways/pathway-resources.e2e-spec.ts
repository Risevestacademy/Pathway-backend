import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import {
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../src/generated/prisma/client';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from '../utils/auth';
import {
  cleanupCatalog,
  seedCatalog,
  type CatalogFixture,
} from '../utils/catalog';

describe('Pathway resources reads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;
  let stepResourceId: string;
  let taskId: string;
  let otherPathwayResourceId: string;
  const createdResourceIds: string[] = [];

  const marker = `e2e-pathway-resources-${Date.now()}`;

  const get = (path: string, token: string | null = user.accessToken) => {
    const req = request(app.getHttpServer()).get(
      `${apiPrefix}/pathways/${path}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const createResource = async (data: {
    title: string;
    type?: ResourceType;
    costStatus?: ResourceCostStatus;
    status?: ResourceStatus;
  }) => {
    const resource = await prisma.resource.create({
      data: {
        url: 'https://example.com/extra',
        provider: 'Example',
        type: ResourceType.ARTICLE,
        curationRationale: 'Internal rationale',
        lastCheckedDate: new Date(),
        ...data,
      },
    });
    createdResourceIds.push(resource.id);
    return resource.id;
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
    await app.init();

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}@test.com`,
    });

    const step1 = await prisma.pathwayStep.findUniqueOrThrow({
      where: { id: catalog.firstStepId },
      select: {
        resources: { select: { resourceId: true } },
        tasks: { select: { id: true } },
      },
    });
    stepResourceId = step1.resources[0].resourceId;
    taskId = step1.tasks[0].id;

    await prisma.pathwayStepResource.update({
      where: {
        pathwayStepId_resourceId: {
          pathwayStepId: catalog.firstStepId,
          resourceId: stepResourceId,
        },
      },
      data: { usageNote: 'Read the first chapter' },
    });
    await prisma.resource.update({
      where: { id: stepResourceId },
      data: { outcomes: ['Explain the basics'] },
    });

    const withdrawnId = await createResource({
      title: `Withdrawn ${marker}`,
      status: ResourceStatus.WITHDRAWN,
    });
    await prisma.pathwayStepResource.create({
      data: { pathwayStepId: catalog.secondStepId, resourceId: withdrawnId },
    });

    const paidCourseId = await createResource({
      title: `Paid course ${marker}`,
      type: ResourceType.COURSE,
      costStatus: ResourceCostStatus.PAID,
    });
    await prisma.careerResource.create({
      data: { careerId: catalog.publishedCareerId, resourceId: paidCourseId },
    });

    const otherStep = await prisma.pathwayStep.findFirstOrThrow({
      where: { pathway: { careerId: catalog.secondPublishedCareerId } },
      select: { resources: { select: { resourceId: true } } },
    });
    otherPathwayResourceId = otherStep.resources[0].resourceId;
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      if (user) await cleanupUsers(prisma, [user.id]);
      await prisma.resource.deleteMany({
        where: { id: { in: createdResourceIds } },
      });
    }
    if (app) await app.close();
  });

  describe('GET /pathways/:pathwayId/resources', () => {
    it('returns the stage tree with ACTIVE resources and the optional paid courses', async () => {
      const res = await get(`${catalog.publishedPathwayId}/resources`).expect(
        200,
      );

      expect(res.body.pathwayId).toBe(catalog.publishedPathwayId);
      expect(res.body.stages).toHaveLength(2);

      const [stageA, stageB] = res.body.stages;
      expect(stageA).toMatchObject({
        id: catalog.firstStageId,
        progress: { completed: 0, total: 2, percentage: 0 },
        quiz: { status: 'NOT_TAKEN' },
      });
      expect(stageB.quiz).toBeNull();

      const [step1, step2] = stageA.steps;
      expect(step1).toMatchObject({
        id: catalog.firstStepId,
        status: 'NOT_STARTED',
        completedAt: null,
      });
      expect(step1.resources).toEqual([
        expect.objectContaining({
          id: stepResourceId,
          isCompleted: false,
          completedAt: null,
        }),
      ]);
      expect(step2.resources).toEqual([]);

      expect(
        res.body.optionalPaidCourses.map(
          ({ title }: { title: string }) => title,
        ),
      ).toEqual([`Paid course ${marker}`]);
    });

    it("shows the caller's resource completion", async () => {
      await prisma.userResourceCompletion.create({
        data: {
          userId: user.id,
          resourceId: stepResourceId,
          completedAt: new Date(),
        },
      });

      try {
        const res = await get(`${catalog.publishedPathwayId}/resources`).expect(
          200,
        );

        expect(res.body.stages[0].steps[0].resources[0]).toMatchObject({
          isCompleted: true,
          completedAt: expect.any(String),
        });
      } finally {
        await prisma.userResourceCompletion.deleteMany({
          where: { userId: user.id },
        });
      }
    });

    it('returns 401 without a token', async () => {
      await get(`${catalog.publishedPathwayId}/resources`, null).expect(401);
    });

    it.each([
      ['a draft career', () => catalog.draftPathwayId],
      [
        'a retired career the caller has not saved',
        () => catalog.retiredPathwayId,
      ],
    ])('returns 404 for %s', async (_, pathwayId) => {
      await get(`${pathwayId()}/resources`).expect(404);
    });
  });

  describe('GET /pathways/:pathwayId/resources/:resourceId', () => {
    const detailPath = (resourceId: string, stepId?: string) =>
      `${catalog.publishedPathwayId}/resources/${resourceId}${
        stepId ? `?stepId=${stepId}` : ''
      }`;

    it("returns the resource with the step's usage note and next task", async () => {
      const res = await get(
        detailPath(stepResourceId, catalog.firstStepId),
      ).expect(200);

      expect(res.body).toMatchObject({
        id: stepResourceId,
        outcomes: ['Explain the basics'],
        url: 'https://example.com/resource',
        usageNote: 'Read the first chapter',
        nextTask: { id: taskId },
        isCompleted: false,
      });
      expect(res.body).not.toHaveProperty('curationRationale');
    });

    it('writes nothing', async () => {
      const before = await Promise.all([
        prisma.userResourceCompletion.count({ where: { userId: user.id } }),
        prisma.activityLedger.count({ where: { userId: user.id } }),
      ]);

      await get(detailPath(stepResourceId, catalog.firstStepId)).expect(200);

      const after = await Promise.all([
        prisma.userResourceCompletion.count({ where: { userId: user.id } }),
        prisma.activityLedger.count({ where: { userId: user.id } }),
      ]);
      expect(after).toEqual(before);
    });

    it('returns 404 for a resource from another pathway', async () => {
      await get(detailPath(otherPathwayResourceId)).expect(404);
    });

    it('returns 404 when the step does not use the resource', async () => {
      await get(detailPath(stepResourceId, catalog.secondStepId)).expect(404);
    });

    it('returns 401 without a token', async () => {
      await get(detailPath(stepResourceId), null).expect(401);
    });
  });
});
