import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { ActivityService } from '../src/activity';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from './utils/auth';
import {
  cleanupCatalog,
  seedCatalog,
  stepsOf,
  type CatalogFixture,
} from './utils/catalog';

describe('Step completion XP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activity: ActivityService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let stepIds: string[];
  let badgeAt50: string;
  let badgeAt100: string;

  const marker = `e2e-step-xp-${Date.now()}`;
  const userIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${label}@test.com`,
    });
    userIds.push(user.id);
    return user;
  };

  const track = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId: catalog.publishedCareerId })
      .expect(200);

  const mark = (user: RegisteredUser, stepId: string, status: string) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/pathway-steps/${stepId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ status });

  const ledgerOf = (userId: string) =>
    prisma.activityLedger.findMany({ where: { userId } });

  const testBadgesOf = async (userId: string) =>
    (
      await prisma.userBadge.findMany({
        where: { userId, badgeId: { in: [badgeAt50, badgeAt100] } },
        select: { badgeId: true },
      })
    ).map(({ badgeId }) => badgeId);

  const statusOf = async (userId: string, pathwayStepId: string) =>
    (
      await prisma.userPathwayStep.findUnique({
        where: { userId_pathwayStepId: { userId, pathwayStepId } },
        select: { status: true },
      })
    )?.status ?? null;

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
    await app.init();

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    stepIds = (await stepsOf(prisma, catalog.publishedCareerId)).map(
      ({ id }) => id,
    );
    ({ id: badgeAt50 } = await prisma.badge.create({
      data: { name: `${marker} 50`, description: 'd', xpThreshold: 50 },
    }));
    ({ id: badgeAt100 } = await prisma.badge.create({
      data: { name: `${marker} 100`, description: 'd', xpThreshold: 100 },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.badge.deleteMany({
        where: { name: { startsWith: marker } },
      });
      if (catalog) await cleanupCatalog(prisma, catalog);
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  it('records one ledger row and awards a met badge when a step is completed', async () => {
    const user = await registerUser('once');
    await track(user);

    await mark(user, stepIds[0], 'COMPLETED').expect(200);

    const ledger = await ledgerOf(user.id);
    expect(ledger).toEqual([
      expect.objectContaining({
        type: 'STEP_COMPLETED',
        referenceId: stepIds[0],
        xp: 50,
      }),
    ]);
    expect(await testBadgesOf(user.id)).toEqual([badgeAt50]);
  });

  it('keeps one ledger row and one award when the same step is marked twice', async () => {
    const user = await registerUser('twice');
    await track(user);

    await mark(user, stepIds[0], 'COMPLETED').expect(200);
    await mark(user, stepIds[0], 'COMPLETED').expect(200);

    expect(await ledgerOf(user.id)).toHaveLength(1);
    expect(await testBadgesOf(user.id)).toEqual([badgeAt50]);
  });

  it('keeps one ledger row under concurrent completions of the same step', async () => {
    const user = await registerUser('concurrent');
    await track(user);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => mark(user, stepIds[0], 'COMPLETED')),
    );

    expect(responses.map(({ status }) => status)).toEqual(Array(5).fill(200));
    expect(await ledgerOf(user.id)).toHaveLength(1);
  });

  it('awards a badge once total XP crosses its threshold, and not before', async () => {
    const user = await registerUser('threshold');
    await track(user);

    await mark(user, stepIds[0], 'COMPLETED').expect(200);
    expect(await testBadgesOf(user.id)).not.toContain(badgeAt100);

    await mark(user, stepIds[1], 'COMPLETED').expect(200);
    expect((await testBadgesOf(user.id)).sort()).toEqual(
      [badgeAt50, badgeAt100].sort(),
    );
  });

  it('awards the threshold badge when two steps complete concurrently', async () => {
    const user = await registerUser('concurrent-threshold');
    await track(user);

    await Promise.all([
      mark(user, stepIds[0], 'COMPLETED').expect(200),
      mark(user, stepIds[1], 'COMPLETED').expect(200),
    ]);

    expect(await testBadgesOf(user.id)).toContain(badgeAt100);
  });

  it('removes nothing on un-mark and awards nothing new on re-mark', async () => {
    const user = await registerUser('remark');
    await track(user);
    await mark(user, stepIds[0], 'COMPLETED').expect(200);
    const [original] = await ledgerOf(user.id);

    await mark(user, stepIds[0], 'NOT_STARTED').expect(200);
    expect(await ledgerOf(user.id)).toEqual([original]);
    expect(await testBadgesOf(user.id)).toEqual([badgeAt50]);

    await mark(user, stepIds[0], 'COMPLETED').expect(200);
    expect(await ledgerOf(user.id)).toEqual([original]);
    expect(await testBadgesOf(user.id)).toEqual([badgeAt50]);
  });

  it('writes no ledger row when the completion is rejected', async () => {
    const user = await registerUser('rejected');

    await mark(user, stepIds[0], 'COMPLETED').expect(409);

    expect(await ledgerOf(user.id)).toEqual([]);
  });

  it('rolls back the completion and the ledger row together when the badge award fails', async () => {
    const user = await registerUser('rollback');
    await track(user);
    jest
      .spyOn(activity, 'awardEarnedBadges')
      .mockRejectedValueOnce(new Error('badge award failed'));

    await mark(user, stepIds[0], 'COMPLETED').expect(500);

    expect(await ledgerOf(user.id)).toEqual([]);
    expect(await statusOf(user.id, stepIds[0])).toBeNull();
    expect(await testBadgesOf(user.id)).toEqual([]);
  });

  it('writes no ledger row for a NOT_STARTED mark', async () => {
    const user = await registerUser('not-started');
    await track(user);

    await mark(user, stepIds[2], 'NOT_STARTED').expect(200);

    expect(await ledgerOf(user.id)).toEqual([]);
  });
});
