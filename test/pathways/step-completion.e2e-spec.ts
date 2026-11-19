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
  stepsOf,
  type CatalogFixture,
} from '../utils/catalog';

describe('PUT /pathways/:pathwayId/steps/:stepId/completion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activity: ActivityService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let otherPathwayStepId: string;

  const marker = `e2e-step-completion-${Date.now()}`;
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

  const complete = (
    user: RegisteredUser | null,
    stepId: string,
    completed: unknown,
    pathwayId = catalog.publishedPathwayId,
  ) => {
    const req = request(app.getHttpServer()).put(
      `${apiPrefix}/pathways/${pathwayId}/steps/${stepId}/completion`,
    );
    if (user) req.set('Authorization', `Bearer ${user.accessToken}`);
    return req.send({ completed });
  };

  const ledgerOf = (userId: string) =>
    prisma.activityLedger.findMany({ where: { userId } });

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
    [{ id: otherPathwayStepId }] = await stepsOf(
      prisma,
      catalog.secondPublishedCareerId,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  it('completes a step and returns its state, progress and XP', async () => {
    const user = await registerUser('shape');
    await save(user);

    const { body } = await complete(user, catalog.firstStepId, true).expect(
      200,
    );

    expect(body).toEqual({
      stepId: catalog.firstStepId,
      status: 'COMPLETED',
      completedAt: expect.any(String),
      progress: {
        completed: 1,
        total: 3,
        percentage: 33,
        nextStepId: catalog.secondStepId,
        selfReported: true,
      },
      stageProgress: {
        stageId: catalog.firstStageId,
        completed: 1,
        total: 2,
        percentage: 50,
      },
      nextStepId: catalog.secondStepId,
      xpAwarded: 50,
    });
  });

  it('is idempotent: a repeat keeps completedAt and awards no XP', async () => {
    const user = await registerUser('repeat');
    await save(user);

    const first = await complete(user, catalog.firstStepId, true).expect(200);
    const second = await complete(user, catalog.firstStepId, true).expect(200);

    expect(second.body.completedAt).toBe(first.body.completedAt);
    expect(second.body.xpAwarded).toBe(0);
    expect(await ledgerOf(user.id)).toHaveLength(1);
  });

  it('undo clears completedAt and keeps XP; re-marking awards nothing', async () => {
    const user = await registerUser('undo');
    await save(user);
    await complete(user, catalog.firstStepId, true).expect(200);

    const undo = await complete(user, catalog.firstStepId, false).expect(200);
    expect(undo.body).toMatchObject({
      status: 'NOT_STARTED',
      completedAt: null,
      xpAwarded: 0,
      nextStepId: catalog.firstStepId,
    });
    expect(await ledgerOf(user.id)).toHaveLength(1);

    const redo = await complete(user, catalog.firstStepId, true).expect(200);
    expect(redo.body.xpAwarded).toBe(0);
    expect(await ledgerOf(user.id)).toHaveLength(1);
  });

  it('leaves no mark and no ledger row when the transaction fails', async () => {
    const user = await registerUser('rollback');
    await save(user);
    jest
      .spyOn(activity, 'awardEarnedBadges')
      .mockRejectedValueOnce(new Error('badge award failed'));

    await complete(user, catalog.firstStepId, true).expect(500);

    expect(await ledgerOf(user.id)).toEqual([]);
    expect(
      await prisma.userPathwayStep.findMany({ where: { userId: user.id } }),
    ).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    await complete(null, catalog.firstStepId, true).expect(401);
  });

  it('returns 409 when the pathway is not saved', async () => {
    const user = await registerUser('unsaved');

    await complete(user, catalog.firstStepId, true).expect(409);

    expect(await ledgerOf(user.id)).toEqual([]);
  });

  it("returns 404 for another pathway's step", async () => {
    const user = await registerUser('other');
    await save(user);

    await complete(user, otherPathwayStepId, true).expect(404);
  });

  it('returns 404 for a draft pathway', async () => {
    const user = await registerUser('draft');
    const [{ id: draftStepId }] = await stepsOf(prisma, catalog.draftCareerId);

    await complete(user, draftStepId, true, catalog.draftPathwayId).expect(404);
  });

  it('returns 400 when completed is not a boolean', async () => {
    const user = await registerUser('invalid');
    await save(user);

    await complete(user, catalog.firstStepId, 'yes').expect(400);
  });
});
