import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { PathwayStepStatus } from '../../src/generated/prisma/client';
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

describe('Pathway progress read (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;
  let newUser: RegisteredUser;

  const marker = `e2e-pathway-progress-${Date.now()}`;

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
    newUser = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-new@test.com`,
    });

    await prisma.userPathway.create({
      data: { userId: user.id, careerId: catalog.publishedCareerId },
    });
    await prisma.userPathwayStep.createMany({
      data: [
        {
          userId: user.id,
          pathwayStepId: catalog.firstStepId,
          status: PathwayStepStatus.COMPLETED,
          completedAt: new Date('2026-11-18T10:00:00.000Z'),
        },
        {
          userId: user.id,
          pathwayStepId: catalog.thirdStepId,
          status: PathwayStepStatus.COMPLETED,
          completedAt: new Date('2026-11-19T10:00:00.000Z'),
        },
      ],
    });
    await prisma.quizAttempt.create({
      data: {
        userId: user.id,
        stageQuizId: catalog.stageQuizId,
        correct: 1,
        total: 1,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      const userIds = [user, newUser].flatMap((u) => (u ? [u.id] : []));
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  describe('GET /pathways/:pathwayId/progress', () => {
    it('returns progress, stage summaries, completed steps newest first and the next step', async () => {
      const res = await get(`${catalog.publishedPathwayId}/progress`).expect(
        200,
      );

      expect(res.body).toMatchObject({
        pathwayId: catalog.publishedPathwayId,
        progress: {
          completed: 2,
          total: 3,
          percentage: 67,
          selfReported: true,
        },
        nextStep: {
          id: catalog.secondStepId,
          stage: { id: catalog.firstStageId, order: 1 },
        },
      });
      expect(res.body.stages).toEqual([
        expect.objectContaining({
          id: catalog.firstStageId,
          progress: { completed: 1, total: 2, percentage: 50 },
          quiz: { status: 'TAKEN', score: { correct: 1, total: 1 } },
        }),
        expect.objectContaining({
          progress: { completed: 1, total: 1, percentage: 100 },
          quiz: null,
        }),
      ]);
      expect(res.body.stages[0]).not.toHaveProperty('steps');
      expect(res.body.completedSteps).toEqual([
        expect.objectContaining({
          id: catalog.thirdStepId,
          completedAt: '2026-11-19T10:00:00.000Z',
        }),
        expect.objectContaining({
          id: catalog.firstStepId,
          completedAt: '2026-11-18T10:00:00.000Z',
          stage: expect.objectContaining({ id: catalog.firstStageId }),
        }),
      ]);
    });

    it('matches the step count and percentage of the pathway read', async () => {
      const [progressRes, readRes] = await Promise.all([
        get(`${catalog.publishedPathwayId}/progress`).expect(200),
        get(catalog.publishedPathwayId).expect(200),
      ]);

      const { completed, total, percentage } = readRes.body.progress;
      expect(progressRes.body.progress).toMatchObject({
        completed,
        total,
        percentage,
      });
    });

    it('returns the structure with zero progress for a pathway the caller has not saved', async () => {
      const res = await get(
        `${catalog.publishedPathwayId}/progress`,
        newUser.accessToken,
      ).expect(200);

      expect(res.body).toMatchObject({
        progress: { completed: 0, total: 3, percentage: 0 },
        completedSteps: [],
        nextStep: { id: catalog.firstStepId },
      });
      expect(res.body.stages).toHaveLength(2);
      expect(res.body.stages[0].quiz).toEqual({ status: 'NOT_TAKEN' });
    });

    it('returns 401 without a token', async () => {
      await get(`${catalog.publishedPathwayId}/progress`, null).expect(401);
    });

    it.each([
      ['a draft career', () => catalog.draftPathwayId],
      [
        'a retired career the caller has not saved',
        () => catalog.retiredPathwayId,
      ],
    ])('returns 404 for %s', async (_, pathwayId) => {
      await get(`${pathwayId()}/progress`).expect(404);
    });
  });
});
