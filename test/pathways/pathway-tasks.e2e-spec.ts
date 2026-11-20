import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import {
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

describe('Pathway tasks reads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;
  let otherUser: RegisteredUser;
  let taskId: string;
  let firstItemId: string;
  let stepResourceId: string;
  let withdrawnId: string;
  let otherPathwayTaskId: string;

  const marker = `e2e-pathway-tasks-${Date.now()}`;

  const get = (path: string, token: string | null = user.accessToken) => {
    const req = request(app.getHttpServer()).get(
      `${apiPrefix}/pathways/${path}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
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
    otherUser = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-other@test.com`,
    });

    const step1 = await prisma.pathwayStep.findUniqueOrThrow({
      where: { id: catalog.firstStepId },
      select: {
        resources: { select: { resourceId: true } },
        tasks: {
          select: { id: true, checklistItems: { select: { id: true } } },
        },
      },
    });
    stepResourceId = step1.resources[0].resourceId;
    taskId = step1.tasks[0].id;
    firstItemId = step1.tasks[0].checklistItems[0].id;

    await prisma.pathwayTaskChecklistItem.create({
      data: { taskId, text: 'Check another thing', order: 2 },
    });

    const withdrawn = await prisma.resource.create({
      data: {
        title: `Withdrawn ${marker}`,
        url: 'https://example.com/withdrawn',
        provider: 'Example',
        type: ResourceType.ARTICLE,
        status: ResourceStatus.WITHDRAWN,
        curationRationale: 'Internal rationale',
        lastCheckedDate: new Date(),
      },
    });
    withdrawnId = withdrawn.id;

    await prisma.pathwayTaskResource.createMany({
      data: [
        { taskId, resourceId: stepResourceId, order: 1 },
        { taskId, resourceId: withdrawnId, order: 2 },
      ],
    });

    await prisma.userTask.create({
      data: { userId: user.id, taskId, completedAt: new Date() },
    });
    await prisma.userTaskChecklistItem.create({
      data: {
        userId: user.id,
        checklistItemId: firstItemId,
        checkedAt: new Date(),
      },
    });

    const otherTask = await prisma.pathwayStepTask.findFirstOrThrow({
      where: {
        step: { pathway: { careerId: catalog.secondPublishedCareerId } },
      },
      select: { id: true },
    });
    otherPathwayTaskId = otherTask.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      const userIds = [user, otherUser].flatMap((u) => (u ? [u.id] : []));
      await cleanupUsers(prisma, userIds);
      if (withdrawnId) {
        await prisma.resource.deleteMany({ where: { id: withdrawnId } });
      }
    }
    if (app) await app.close();
  });

  describe('GET /pathways/:pathwayId/tasks', () => {
    it("returns the stage tree with the caller's task completion and checklist counts", async () => {
      const res = await get(`${catalog.publishedPathwayId}/tasks`).expect(200);

      expect(res.body.pathwayId).toBe(catalog.publishedPathwayId);
      expect(res.body.stages).toHaveLength(2);

      const [stageA] = res.body.stages;
      expect(stageA).toMatchObject({
        id: catalog.firstStageId,
        progress: { completed: 0, total: 2, percentage: 0 },
        quiz: { status: 'NOT_TAKEN' },
      });

      const [step1, step2] = stageA.steps;
      expect(step1).toMatchObject({
        id: catalog.firstStepId,
        status: 'NOT_STARTED',
        completedAt: null,
      });
      expect(step1.tasks).toEqual([
        {
          id: taskId,
          title: expect.any(String),
          goal: 'Build something',
          estimatedWeeks: null,
          isCompleted: true,
          completedAt: expect.any(String),
          checklistChecked: 1,
          checklistTotal: 2,
        },
      ]);
      expect(step2.tasks).toEqual([]);
    });

    it("never shows one user's ticks to another", async () => {
      const res = await get(
        `${catalog.publishedPathwayId}/tasks`,
        otherUser.accessToken,
      ).expect(200);

      expect(res.body.stages[0].steps[0].tasks[0]).toMatchObject({
        isCompleted: false,
        completedAt: null,
        checklistChecked: 0,
        checklistTotal: 2,
      });
    });

    it('returns 401 without a token', async () => {
      await get(`${catalog.publishedPathwayId}/tasks`, null).expect(401);
    });

    it.each([
      ['a draft career', () => catalog.draftPathwayId],
      [
        'a retired career the caller has not saved',
        () => catalog.retiredPathwayId,
      ],
    ])('returns 404 for %s', async (_, pathwayId) => {
      await get(`${pathwayId()}/tasks`).expect(404);
    });
  });

  describe('GET /pathways/:pathwayId/tasks/:taskId', () => {
    const detailPath = (id: string) =>
      `${catalog.publishedPathwayId}/tasks/${id}`;

    it('returns the brief with the checklist and ACTIVE helpful links', async () => {
      const res = await get(detailPath(taskId)).expect(200);

      expect(res.body).toMatchObject({
        id: taskId,
        stepId: catalog.firstStepId,
        whatToMake: ['A page'],
        hints: ['Start small'],
        isCompleted: true,
        checklistChecked: 1,
        checklistTotal: 2,
      });
      expect(res.body.checklist).toEqual([
        {
          id: firstItemId,
          text: 'Check one thing',
          isChecked: true,
          checkedAt: expect.any(String),
        },
        {
          id: expect.any(String),
          text: 'Check another thing',
          isChecked: false,
          checkedAt: null,
        },
      ]);
      expect(res.body.helpfulLinks).toEqual([
        expect.objectContaining({
          id: stepResourceId,
          url: 'https://example.com/resource',
        }),
      ]);
      expect(res.body.helpfulLinks[0]).not.toHaveProperty('curationRationale');
    });

    it("never shows one user's ticks to another", async () => {
      const res = await get(detailPath(taskId), otherUser.accessToken).expect(
        200,
      );

      expect(res.body).toMatchObject({
        isCompleted: false,
        checklistChecked: 0,
      });
      expect(
        res.body.checklist.map(
          ({ isChecked }: { isChecked: boolean }) => isChecked,
        ),
      ).toEqual([false, false]);
    });

    it('writes nothing', async () => {
      const counts = () =>
        Promise.all([
          prisma.userTask.count({ where: { userId: user.id } }),
          prisma.userTaskChecklistItem.count({ where: { userId: user.id } }),
          prisma.activityLedger.count({ where: { userId: user.id } }),
        ]);
      const before = await counts();

      await get(detailPath(taskId)).expect(200);

      expect(await counts()).toEqual(before);
    });

    it('returns 404 for a task from another pathway', async () => {
      await get(detailPath(otherPathwayTaskId)).expect(404);
    });

    it('returns 401 without a token', async () => {
      await get(detailPath(taskId), null).expect(401);
    });
  });
});
