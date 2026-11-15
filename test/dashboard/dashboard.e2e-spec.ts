import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { PathwayStepStatus } from '../../src/generated/prisma/client';
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

// --- Local types for the response assertions (avoids `any`) ---

interface E2eDashboardGoal {
  kind: 'STEP' | 'TASK' | 'RESOURCE' | 'CHECKLIST';
  id: string;
}

interface E2eWeekDay {
  date: string;
  active: boolean;
}

interface E2eHeatmapDay {
  date: string;
  count: number;
}

interface E2eDashboardResponse {
  totals: {
    savedPathways: number;
    completedSteps: number;
    xp: number;
    badgesEarned: number;
    badgesTotal: number;
  };
  streak: { current: number; longest: number };
  weekStrip: { days: E2eWeekDay[]; currentStreak: number };
  heatmap: { to: string; days: E2eHeatmapDay[] };
  badges: { id: string }[];
  activePathway: {
    pathwayId: string;
    career: { id: string };
    progress: {
      completed: number;
      total: number;
      nextStepId: string | null;
    };
  } | null;
  currentProject: {
    stageId: string;
    stageTitle: string;
    stageDescription: string | null;
    completed: number;
    total: number;
    percentage: number;
  } | null;
  goals: E2eDashboardGoal[];
}

let dashboardResourceId: string;

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let badgeId: string;

  const marker = `e2e-dashboard-${Date.now()}`;
  const userIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${label}@test.com`,
    });
    userIds.push(user.id);
    return user;
  };

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

    // The shared seedCatalog leaves step 2 bare. The dashboard test needs a
    // task, a checklist item, and a resource on the *next* step (step 2) to
    // prove the goals composition wire-through. Scoped to this file only.
    await prisma.pathwayStepTask.create({
      data: {
        stepId: catalog.secondStepId,
        title: `Dashboard task ${marker}`,
        goal: 'Build the thing',
        order: 1,
        whatToMake: ['The thing'],
        hints: [],
        checklistItems: {
          create: [{ text: `Dashboard check ${marker}`, order: 1 }],
        },
      },
    });

    const resource = await prisma.resource.create({
      data: {
        title: `Dashboard resource ${marker}`,
        url: 'https://example.com/dashboard-resource',
        type: 'ARTICLE',
        provider: 'Example',
        curationRationale: 'For the dashboard test',
        lastCheckedDate: new Date(),
        pathwaySteps: { create: [{ pathwayStepId: catalog.secondStepId }] },
      },
    });
    dashboardResourceId = resource.id;

    const badge = await prisma.badge.create({
      data: {
        name: `Dashboard badge ${marker}`,
        description: 'Awarded at 50 XP',
        iconKey: 'leaf',
        xpThreshold: 50,
      },
    });
    badgeId = badge.id;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await prisma.resource
      .delete({ where: { id: dashboardResourceId } })
      .catch(() => {});
    await cleanupCatalog(prisma, catalog);
    await prisma.badge.deleteMany({ where: { id: badgeId } });
    await app.close();
  });

  it('rejects a request without a token', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/me/dashboard`)
      .expect(401);
  });

  it('gives a new user every field present, with zeros and empty lists', async () => {
    const user = await registerUser('new');

    const { body } = await dashboardOf(user).expect(200);
    const data = body as E2eDashboardResponse;

    // The ticket's core acceptance criterion: the frontend can render the
    // whole page from this one call without fallback logic.
    expect(Object.keys(body).sort()).toEqual([
      'activePathway',
      'badges',
      'currentProject',
      'goals',
      'heatmap',
      'streak',
      'totals',
      'weekStrip',
    ]);

    expect(data.totals).toMatchObject({
      savedPathways: 0,
      completedSteps: 0,
      xp: 0,
      badgesEarned: 0,
    });
    expect(data.totals.badgesTotal).toBeGreaterThan(0);

    expect(data.streak).toEqual({ current: 0, longest: 0 });
    expect(data.weekStrip.days).toHaveLength(7);
    expect(data.weekStrip.days.every((d) => !d.active)).toBe(true);
    expect(data.weekStrip.currentStreak).toBe(0);

    expect(data.heatmap.days).toHaveLength(365);
    expect(data.heatmap.days.every((d) => d.count === 0)).toBe(true);

    expect(data.badges).toEqual([]);
    expect(data.activePathway).toBeNull();
    expect(data.currentProject).toBeNull();
    expect(data.goals).toEqual([]);
  });

  it('renders the whole dashboard from one call once the user is active', async () => {
    const user = await registerUser('active');
    await track(user);
    await complete(user, catalog.firstStepId);

    const { body } = await dashboardOf(user).expect(200);
    const data = body as E2eDashboardResponse;

    expect(data.totals).toMatchObject({
      savedPathways: 1,
      completedSteps: 1,
      xp: 50,
    });
    expect(data.streak).toEqual({ current: 1, longest: 1 });
    expect(data.badges.map((badge) => badge.id)).toContain(badgeId);

    expect(data.activePathway?.career.id).toBe(catalog.publishedCareerId);
    expect(data.activePathway?.progress).toMatchObject({
      completed: 1,
      total: 3,
      nextStepId: catalog.secondStepId,
    });

    expect(data.currentProject).toMatchObject({
      stageId: catalog.firstStageId,
      stageTitle: expect.stringContaining('Stage A') as string,
      stageDescription: 'Stage A description',
      completed: 1,
      total: 2,
      percentage: 50,
    });

    expect(data.goals.map((g) => g.kind)).toEqual([
      'STEP',
      'TASK',
      'CHECKLIST',
      'RESOURCE',
    ]);
    expect(data.goals[0].id).toBe(catalog.secondStepId);

    expect(data.heatmap.days).toContainEqual({
      date: data.heatmap.to,
      count: 1,
    });
    expect(data.weekStrip.days.some((d) => d.active)).toBe(true);
  });

  it('agrees with the pathway read about progress, the next step, and the current stage', async () => {
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

    const data = dashboard.body as E2eDashboardResponse;
    const pathwayData = pathway.body as {
      id: string;
      progress: {
        completed: number;
        total: number;
        percentage: number;
        nextStepId: string | null;
        selfReported: true;
      };
    };

    // Single-source proof: active pathway block matches the pathway read exactly
    expect(data.activePathway?.pathwayId).toBe(pathwayData.id);
    expect(data.activePathway?.progress).toEqual(pathwayData.progress);

    // Goals start from the same next step the pathway read reports
    const firstGoal = data.goals.find((g) => g.kind === 'STEP');
    expect(firstGoal?.id).toBe(pathwayData.progress.nextStepId);
  });

  it('empties goals once every step is complete', async () => {
    const user = await registerUser('finished');
    await track(user);
    await complete(user, catalog.firstStepId);
    await complete(user, catalog.secondStepId);
    await complete(user, catalog.thirdStepId);

    const { body } = await dashboardOf(user).expect(200);
    const data = body as E2eDashboardResponse;

    expect(data.activePathway?.progress.nextStepId).toBeNull();
    expect(data.goals).toEqual([]);
    expect(data.totals.completedSteps).toBe(3);
  });
});
