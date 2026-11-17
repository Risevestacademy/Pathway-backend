import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { ActivityService } from '../../src/activity';
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

interface PathwayItems {
  resourceId: string;
  taskId: string;
  itemId: string;
}

describe('Pathway resource, task and checklist completion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activity: ActivityService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let items: PathwayItems;
  let otherItems: PathwayItems;
  let secondPathwayId: string;

  const marker = `e2e-item-completion-${Date.now()}`;
  const userIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${label}@test.com`,
    });
    userIds.push(user.id);
    return user;
  };

  const save = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId: catalog.publishedCareerId })
      .expect(200);

  const put = (user: RegisteredUser | null, path: string, body: object) => {
    const req = request(app.getHttpServer()).put(
      `${apiPrefix}/pathways/${path}`,
    );
    if (user) req.set('Authorization', `Bearer ${user.accessToken}`);
    return req.send(body);
  };

  const completeResource = (
    user: RegisteredUser | null,
    completed: boolean,
    resourceId = items.resourceId,
  ) =>
    put(
      user,
      `${catalog.publishedPathwayId}/resources/${resourceId}/completion`,
      { completed },
    );

  const completeTask = (
    user: RegisteredUser | null,
    completed: boolean,
    taskId = items.taskId,
  ) =>
    put(user, `${catalog.publishedPathwayId}/tasks/${taskId}/completion`, {
      completed,
    });

  const tick = (
    user: RegisteredUser | null,
    checked: boolean,
    itemId = items.itemId,
  ) =>
    put(
      user,
      `${catalog.publishedPathwayId}/tasks/${items.taskId}/checklist/${itemId}`,
      { checked },
    );

  const ledgerOf = (userId: string) =>
    prisma.activityLedger.findMany({ where: { userId } });

  const itemsOf = async (pathwayId: string): Promise<PathwayItems> => {
    const step = await prisma.pathwayStep.findFirstOrThrow({
      where: { pathwayId, order: 1 },
      select: {
        resources: { select: { resourceId: true } },
        tasks: {
          select: { id: true, checklistItems: { select: { id: true } } },
        },
      },
    });
    return {
      resourceId: step.resources[0].resourceId,
      taskId: step.tasks[0].id,
      itemId: step.tasks[0].checklistItems[0].id,
    };
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
    activity = app.get(ActivityService);
    await app.listen(0, '127.0.0.1');

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    items = await itemsOf(catalog.publishedPathwayId);
    ({ id: secondPathwayId } = await prisma.pathway.findUniqueOrThrow({
      where: { careerId: catalog.secondPublishedCareerId },
      select: { id: true },
    }));
    otherItems = await itemsOf(secondPathwayId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) {
        await prisma.resource.deleteMany({
          where: {
            id: {
              in: [items?.resourceId, otherItems?.resourceId].filter(Boolean),
            },
          },
        });
        await cleanupCatalog(prisma, catalog);
      }
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  describe('resource completion', () => {
    it('completes, undoes and completes again, awarding XP once', async () => {
      const user = await registerUser('resource');
      await save(user);

      const first = await completeResource(user, true).expect(200);
      expect(first.body).toEqual({
        resourceId: items.resourceId,
        completed: true,
        completedAt: expect.any(String),
        xpAwarded: 10,
      });

      const undo = await completeResource(user, false).expect(200);
      expect(undo.body).toMatchObject({
        completed: false,
        completedAt: null,
        xpAwarded: 0,
      });

      const again = await completeResource(user, true).expect(200);
      expect(again.body.xpAwarded).toBe(0);

      const ledger = await ledgerOf(user.id);
      expect(ledger).toEqual([
        expect.objectContaining({
          type: 'RESOURCE_COMPLETED',
          referenceId: items.resourceId,
          xp: 10,
        }),
      ]);
    });

    it('does not complete the step', async () => {
      const user = await registerUser('resource-step');
      await save(user);

      await completeResource(user, true).expect(200);

      expect(
        await prisma.userPathwayStep.findMany({ where: { userId: user.id } }),
      ).toEqual([]);
    });

    it('leaves no mark and no ledger row when the transaction fails', async () => {
      const user = await registerUser('resource-rollback');
      await save(user);
      jest
        .spyOn(activity, 'awardEarnedBadges')
        .mockRejectedValueOnce(new Error('badge award failed'));

      await completeResource(user, true).expect(500);

      expect(await ledgerOf(user.id)).toEqual([]);
      expect(
        await prisma.userResourceCompletion.findMany({
          where: { userId: user.id },
        }),
      ).toEqual([]);
    });

    it('lets a withdrawn resource be undone but not completed', async () => {
      const user = await registerUser('resource-withdrawn');
      await save(user);
      await completeResource(user, true).expect(200);

      await prisma.resource.update({
        where: { id: items.resourceId },
        data: { status: 'WITHDRAWN' },
      });
      try {
        const undo = await completeResource(user, false).expect(200);
        expect(undo.body.completedAt).toBeNull();

        await completeResource(user, true).expect(404);
      } finally {
        await prisma.resource.update({
          where: { id: items.resourceId },
          data: { status: 'ACTIVE' },
        });
      }
    });

    it("returns 404 for another pathway's resource", async () => {
      const user = await registerUser('resource-other');
      await save(user);

      await completeResource(user, true, otherItems.resourceId).expect(404);
    });

    it('returns 409 when the pathway is not saved', async () => {
      const user = await registerUser('resource-unsaved');

      await completeResource(user, true).expect(409);
    });

    it('returns 401 without a token', async () => {
      await completeResource(null, true).expect(401);
    });
  });

  describe('task completion', () => {
    it('completes, undoes and completes again, awarding XP once', async () => {
      const user = await registerUser('task');
      await save(user);

      const first = await completeTask(user, true).expect(200);
      expect(first.body).toEqual({
        taskId: items.taskId,
        completed: true,
        completedAt: expect.any(String),
        xpAwarded: 30,
        checklistChecked: 0,
        checklistTotal: 1,
      });

      const undo = await completeTask(user, false).expect(200);
      expect(undo.body).toMatchObject({
        completed: false,
        completedAt: null,
        xpAwarded: 0,
      });

      const again = await completeTask(user, true).expect(200);
      expect(again.body).toMatchObject({
        completed: true,
        completedAt: expect.any(String),
        xpAwarded: 0,
      });

      expect(await ledgerOf(user.id)).toEqual([
        expect.objectContaining({ type: 'TASK_COMPLETED', xp: 30 }),
      ]);
    });

    it('leaves no mark and no ledger row when the transaction fails', async () => {
      const user = await registerUser('task-rollback');
      await save(user);
      jest
        .spyOn(activity, 'awardEarnedBadges')
        .mockRejectedValueOnce(new Error('badge award failed'));

      await completeTask(user, true).expect(500);

      expect(await ledgerOf(user.id)).toEqual([]);
      expect(
        await prisma.userTask.findMany({ where: { userId: user.id } }),
      ).toEqual([]);
    });

    it("returns 404 for another pathway's task", async () => {
      const user = await registerUser('task-other');
      await save(user);

      await completeTask(user, true, otherItems.taskId).expect(404);
    });

    it('returns 409 when the pathway is not saved', async () => {
      const user = await registerUser('task-unsaved');

      await completeTask(user, true).expect(409);
    });

    it('returns 401 without a token', async () => {
      await completeTask(null, true).expect(401);
    });
  });

  describe('checklist items', () => {
    it('ticks and unticks an item without awarding XP or completing the task', async () => {
      const user = await registerUser('tick');
      await save(user);

      const ticked = await tick(user, true).expect(200);
      expect(ticked.body).toEqual({
        itemId: items.itemId,
        taskId: items.taskId,
        checked: true,
        checkedAt: expect.any(String),
        checklistChecked: 1,
        checklistTotal: 1,
      });

      await tick(user, true).expect(200);

      const unticked = await tick(user, false).expect(200);
      expect(unticked.body).toMatchObject({
        checked: false,
        checkedAt: null,
        checklistChecked: 0,
      });

      expect(await ledgerOf(user.id)).toEqual([]);
      expect(
        await prisma.userTask.findMany({ where: { userId: user.id } }),
      ).toEqual([]);
    });

    it("never counts another user's ticks", async () => {
      const ticker = await registerUser('ticker');
      const other = await registerUser('ticker-other');
      await save(ticker);
      await save(other);

      await tick(ticker, true).expect(200);
      const { body } = await completeTask(other, false).expect(200);

      expect(body.checklistChecked).toBe(0);
    });

    it("returns 404 for an item on another pathway's task", async () => {
      const user = await registerUser('tick-other');
      await save(user);

      await tick(user, true, otherItems.itemId).expect(404);
    });

    it('returns 409 when the pathway is not saved', async () => {
      const user = await registerUser('tick-unsaved');

      await tick(user, true).expect(409);
    });

    it('returns 400 when checked is missing', async () => {
      const user = await registerUser('tick-invalid');
      await save(user);

      await put(
        user,
        `${catalog.publishedPathwayId}/tasks/${items.taskId}/checklist/${items.itemId}`,
        {},
      ).expect(400);
    });
  });

  it('ticking everything in a step does not complete it', async () => {
    const user = await registerUser('everything');
    await save(user);

    await completeResource(user, true).expect(200);
    await completeTask(user, true).expect(200);
    await tick(user, true).expect(200);

    expect(
      await prisma.userPathwayStep.findMany({ where: { userId: user.id } }),
    ).toEqual([]);
  });
});
