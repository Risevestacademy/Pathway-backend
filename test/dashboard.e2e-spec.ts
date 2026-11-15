import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { ResourceStatus } from '../src/generated/prisma/client';
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
  type CatalogFixture,
} from './utils/catalog';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let badgeId: string;
  let extraResourceIds: string[] = [];
  let withdrawnResourceId: string;

  const marker = `e2e-dashboard-${Date.now()}`;
  const userIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${label}@test.com`,
    });
    userIds.push(user.id);
    return user;
  };

  const utcDay = () => new Date().toISOString().slice(0, 10);

  const dashboardOf = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/dashboard`)
      .set('Authorization', `Bearer ${user.accessToken}`);

  const track = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId: catalog.publishedCareerId })
      .expect(200);

  const complete = (user: RegisteredUser, stepId: string) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/pathway-steps/${stepId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

  beforeAll(async () => {
    wireNotificationMock();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = module.createNestApplication();
    configureApp(app);

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    apiPrefix = `/${resolveApiPrefix(config)}`;

    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    catalog = await seedCatalog(prisma, { suffix: marker });

    const badge = await prisma.badge.create({
      data: {
        name: `Dashboard badge ${marker}`,
        description: 'Awarded at 50 XP',
        iconKey: 'leaf',
        xpThreshold: 50,
      },
    });
    badgeId = badge.id;

    const extraResource = (title: string, status: ResourceStatus) =>
      prisma.resource.create({
        data: {
          title,
          url: 'https://example.com/extra',
          type: 'ARTICLE',
          provider: 'Example',
          curationRationale: 'Attached to the first step',
          lastCheckedDate: new Date(),
          status,
          pathwaySteps: { create: [{ pathwayStepId: catalog.firstStepId }] },
        },
      });

    const [active, withdrawn] = await Promise.all([
      extraResource(`AAA active ${marker}`, ResourceStatus.ACTIVE),
      extraResource(`ZZZ withdrawn ${marker}`, ResourceStatus.WITHDRAWN),
    ]);
    extraResourceIds = [active.id, withdrawn.id];
    withdrawnResourceId = withdrawn.id;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await cleanupCatalog(prisma, catalog);
    await prisma.badge.deleteMany({ where: { id: badgeId } });
    await prisma.resource.deleteMany({
      where: { id: { in: extraResourceIds } },
    });
    await app.close();
  });

  it('rejects a request without a token', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/me/dashboard`)
      .expect(401);
  });

  it('gives a new user zeros and empty lists, never nulls', async () => {
    const user = await registerUser('new');

    const { body } = await dashboardOf(user).expect(200);

    expect(body.totals).toMatchObject({
      savedPathways: 0,
      completedSteps: 0,
      xp: 0,
      badgesEarned: 0,
    });
    expect(body.totals.badgesTotal).toBeGreaterThan(0);
    expect(body.streak).toEqual({ current: 0, longest: 0 });
    expect(body.badges).toEqual([]);
    expect(body.todaysGoals).toEqual({
      step: null,
      tasks: [],
      resources: [],
    });
    expect(body.activePathway).toBeNull();
  });

  it('covers a full year of days, with today last', async () => {
    const user = await registerUser('heatmap');

    const { body } = await dashboardOf(user).expect(200);

    expect(body.heatmap.days).toHaveLength(365);
    expect(body.heatmap.days[0].date).toBe(body.heatmap.from);
    expect(body.heatmap.days[364].date).toBe(body.heatmap.to);
    expect(body.heatmap.days.every((d) => d.count === 0)).toBe(true);
  });

  it('ends the heatmap on the day the request was served', async () => {
    const user = await registerUser('heatmap-window');

    const before = utcDay();
    const { body } = await dashboardOf(user).expect(200);
    const after = utcDay();

    expect([before, after]).toContain(body.heatmap.to);
  });

  it('renders the whole dashboard from one call once the user is active', async () => {
    const user = await registerUser('active');
    await track(user);
    await complete(user, catalog.firstStepId);

    const { body } = await dashboardOf(user).expect(200);

    expect(body.totals).toMatchObject({
      savedPathways: 1,
      completedSteps: 1,
      xp: 50,
    });
    expect(body.streak).toEqual({ current: 1, longest: 1 });

    expect(body.badges.map((badge) => badge.id)).toContain(badgeId);
    expect(body.badges.find((badge) => badge.id === badgeId)).toMatchObject({
      iconKey: 'leaf',
      xpThreshold: 50,
    });
    expect(body.totals.badgesEarned).toBe(body.badges.length);

    expect(body.activePathway.career.id).toBe(catalog.publishedCareerId);
    expect(body.activePathway.progress).toMatchObject({
      completed: 1,
      total: 3,
      nextStepId: catalog.secondStepId,
    });

    expect(body.heatmap.days).toContainEqual({
      date: body.heatmap.to,
      count: 1,
    });
  });

  it('agrees with the pathway read about progress and the next step', async () => {
    const user = await registerUser('agrees');
    await track(user);
    await complete(user, catalog.firstStepId);

    const [dashboard, pathway] = await Promise.all([
      dashboardOf(user).expect(200),
      request(app.getHttpServer())
        .get(`${apiPrefix}/pathways/${catalog.publishedPathwayId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200),
    ]);

    expect(dashboard.body.activePathway.pathwayId).toBe(pathway.body.id);
    expect(dashboard.body.activePathway.progress).toEqual(
      pathway.body.progress,
    );
    expect(dashboard.body.todaysGoals.step.id).toBe(
      pathway.body.progress.nextStepId,
    );
  });

  it("points today's goals at the next step, with its tasks and resources", async () => {
    const user = await registerUser('goals');
    await track(user);

    const { body } = await dashboardOf(user).expect(200);

    expect(body.todaysGoals.step).toMatchObject({
      id: catalog.firstStepId,
      order: 1,
    });
    expect(body.todaysGoals.tasks).toHaveLength(1);
    expect(body.todaysGoals.tasks[0]).toMatchObject({
      goal: 'Build something',
      whatToMake: ['A page'],
      checklist: ['Check one thing'],
    });
    const titles = body.todaysGoals.resources.map(
      (resource: { title: string }) => resource.title,
    );
    expect(titles).toEqual([...titles].sort());
    expect(titles[0]).toBe(`AAA active ${marker}`);

    const ids = body.todaysGoals.resources.map(
      (resource: { id: string }) => resource.id,
    );
    expect(ids).not.toContain(withdrawnResourceId);
  });

  it("empties today's goals once every step is complete", async () => {
    const user = await registerUser('finished');
    await track(user);
    await complete(user, catalog.firstStepId);
    await complete(user, catalog.secondStepId);
    await complete(user, catalog.thirdStepId);

    const { body } = await dashboardOf(user).expect(200);

    expect(body.activePathway.progress.nextStepId).toBeNull();
    expect(body.todaysGoals).toEqual({
      step: null,
      tasks: [],
      resources: [],
    });
    expect(body.totals.completedSteps).toBe(3);
  });

  it('reads the same for an opted-out user as for an opted-in one', async () => {
    const optedIn = await registerUser('opted-in');
    const optedOut = await registerUser('opted-out');

    await prisma.user.update({
      where: { id: optedOut.id },
      data: { analyticsEnabled: false },
    });

    for (const user of [optedIn, optedOut]) {
      await track(user);
      await complete(user, catalog.firstStepId);
      await complete(user, catalog.secondStepId);
    }

    const [a, b] = await Promise.all([
      dashboardOf(optedIn).expect(200),
      dashboardOf(optedOut).expect(200),
    ]);

    const activeDays = (body: { heatmap: { days: { count: number }[] } }) =>
      body.heatmap.days.filter(({ count }) => count > 0);

    expect(b.body.totals).toEqual(a.body.totals);
    expect(b.body.streak).toEqual(a.body.streak);
    expect(activeDays(b.body)).toEqual(activeDays(a.body));
    expect(b.body.todaysGoals).toEqual(a.body.todaysGoals);
    expect(b.body.badges.map((badge) => badge.id)).toEqual(
      a.body.badges.map((badge) => badge.id),
    );
  });
});
