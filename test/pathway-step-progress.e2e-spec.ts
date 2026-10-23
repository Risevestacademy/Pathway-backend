import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { AnalyticsService } from '../src/analytics';
import {
  cleanupCatalog,
  seedCatalog,
  stepsOf,
  type CatalogFixture,
} from './utils/catalog';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from './utils/auth';

describe('Pathway step progress (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let captureSpy: jest.SpyInstance;

  let catalog: CatalogFixture;

  const createdUserIds: string[] = [];

  // ──────────────────────────────────────────────────────────────
  // Suite-local helpers (kept here on purpose — they exercise the
  // endpoints under test, so wrapping them in a util would hide the
  // contract this suite is supposed to be verifying).
  // ──────────────────────────────────────────────────────────────
  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-step-progress-${label}-${Date.now()}@test.com`,
    });
    createdUserIds.push(registered.id);
    return registered;
  };

  const putStatus = (user: RegisteredUser, stepId: string, body: object) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/pathway-steps/${stepId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);

  const save = (user: RegisteredUser, careerId: string) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId })
      .expect(200);

  const stepEvents = () =>
    captureSpy.mock.calls.filter(
      ([event]) => event === 'step_completion_changed',
    );

  // ──────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────
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

    await app.init();

    prisma = app.get(PrismaService);
    captureSpy = jest.spyOn(app.get(AnalyticsService), 'capture');
    wireNotificationMock();

    catalog = await seedCatalog(prisma);
  });

  beforeEach(() => {
    captureSpy.mockClear();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (catalog) {
      await cleanupCatalog(prisma, catalog);
    }
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────
  // Validation and access
  // ──────────────────────────────────────────────────────────────
  describe('validation and access', () => {
    let user: RegisteredUser;
    let stepId: string;

    beforeAll(async () => {
      user = await registerUser('validation');
      [{ id: stepId }] = await stepsOf(prisma, catalog.publishedCareerId);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .put(`${apiPrefix}/me/pathway-steps/${stepId}`)
        .send({ status: 'COMPLETED' })
        .expect(401);
    });

    it('returns 400 for an invalid step id', async () => {
      await putStatus(user, 'not-a-uuid', { status: 'COMPLETED' }).expect(400);
    });

    it.each([
      ['missing', {}],
      ['IN_PROGRESS', { status: 'IN_PROGRESS' }],
      ['unknown', { status: 'DONE' }],
    ])(
      'returns 400 in the standard validation format for a %s status',
      async (_label, body) => {
        const response = await putStatus(user, stepId, body).expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.fields).toHaveProperty('status');
      },
    );

    it('returns 404 for an unknown step', async () => {
      await putStatus(user, '3f2b8c1e-6a4d-4e2f-9b7a-1c5d8e0f2a6b', {
        status: 'COMPLETED',
      }).expect(404);
    });

    it("returns 404 for a step under a DRAFT career, even if it's saved", async () => {
      await prisma.userPathway.create({
        data: { userId: user.id, careerId: catalog.draftCareerId },
      });
      const [draftStep] = await stepsOf(prisma, catalog.draftCareerId);

      await putStatus(user, draftStep.id, { status: 'COMPLETED' }).expect(404);
    });

    it("returns 404 for a step under a RETIRED career the user didn't save", async () => {
      const [retiredStep] = await stepsOf(prisma, catalog.retiredCareerId);

      await putStatus(user, retiredStep.id, { status: 'COMPLETED' }).expect(
        404,
      );
    });

    it("returns 409 for a PUBLISHED career the user hasn't saved, writing nothing", async () => {
      const response = await putStatus(user, stepId, {
        status: 'COMPLETED',
      }).expect(409);

      expect(response.body.error).toBe('CONFLICT');
      await expect(
        prisma.userPathwayStep.count({ where: { userId: user.id } }),
      ).resolves.toBe(0);
      expect(stepEvents()).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Marking steps
  // ──────────────────────────────────────────────────────────────
  describe('marking steps', () => {
    it('completes a step, returns updated progress and emits once', async () => {
      const user = await registerUser('complete');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);

      const response = await putStatus(user, first.id, {
        status: 'COMPLETED',
      }).expect(200);

      expect(response.body).toEqual({
        stepId: first.id,
        status: 'COMPLETED',
        progress: {
          completed: 1,
          total: 3,
          percentage: 33,
          nextStepId: expect.any(String),
          selfReported: true,
          startStepId: null,
        },
      });

      const row = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: { userId: user.id, pathwayStepId: first.id },
        },
      });
      expect(row.status).toBe('COMPLETED');
      expect(row.completedAt).not.toBeNull();
      expect(stepEvents()).toEqual([
        [
          'step_completion_changed',
          user.id,
          {
            careerId: catalog.publishedCareerId,
            stepId: first.id,
            status: 'COMPLETED',
          },
        ],
      ]);
    });

    it('is idempotent: a repeat changes nothing and emits nothing', async () => {
      const user = await registerUser('repeat');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);

      const firstResponse = await putStatus(user, first.id, {
        status: 'COMPLETED',
      }).expect(200);
      const before = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: { userId: user.id, pathwayStepId: first.id },
        },
      });
      captureSpy.mockClear();

      const secondResponse = await putStatus(user, first.id, {
        status: 'COMPLETED',
      }).expect(200);
      const after = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: { userId: user.id, pathwayStepId: first.id },
        },
      });

      expect(secondResponse.body).toEqual(firstResponse.body);
      expect(after.completedAt).toEqual(before.completedAt);
      expect(stepEvents()).toHaveLength(0);
    });

    it('emits exactly once for concurrent identical requests', async () => {
      const user = await registerUser('concurrent');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          putStatus(user, first.id, { status: 'COMPLETED' }),
        ),
      );

      expect(responses.every((response) => response.status === 200)).toBe(true);
      await expect(
        prisma.userPathwayStep.count({
          where: { userId: user.id, pathwayStepId: first.id },
        }),
      ).resolves.toBe(1);
      expect(stepEvents()).toHaveLength(1);
    });

    it('marking NOT_STARTED clears completedAt and emits', async () => {
      const user = await registerUser('undo');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);
      await putStatus(user, first.id, { status: 'COMPLETED' }).expect(200);
      captureSpy.mockClear();

      const response = await putStatus(user, first.id, {
        status: 'NOT_STARTED',
      }).expect(200);

      expect(response.body.progress.completed).toBe(0);
      const row = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: { userId: user.id, pathwayStepId: first.id },
        },
      });
      expect(row.status).toBe('NOT_STARTED');
      expect(row.completedAt).toBeNull();
      expect(stepEvents()).toHaveLength(1);
    });

    it('nextStepId follows the saved starting point', async () => {
      const user = await registerUser('start-point');
      const [first, second, third] = await stepsOf(
        prisma,
        catalog.publishedCareerId,
      );
      await save(user, catalog.publishedCareerId);
      await prisma.userPathway.update({
        where: {
          userId_careerId: {
            userId: user.id,
            careerId: catalog.publishedCareerId,
          },
        },
        data: { startStepId: second.id },
      });

      const response = await putStatus(user, second.id, {
        status: 'COMPLETED',
      }).expect(200);

      expect(response.body.progress).toMatchObject({
        completed: 1,
        nextStepId: third.id,
        startStepId: second.id,
      });
      expect(response.body.progress.nextStepId).not.toBe(first.id);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Eligibility beyond the active pathway
  // ──────────────────────────────────────────────────────────────
  describe('eligibility beyond the active pathway', () => {
    it('allows a saved pathway that is not active, and switching keeps the progress', async () => {
      const user = await registerUser('inactive');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);
      await save(user, catalog.secondPublishedCareerId);

      await putStatus(user, first.id, { status: 'COMPLETED' }).expect(200);
      await save(user, catalog.publishedCareerId);

      const active = await request(app.getHttpServer())
        .get(`${apiPrefix}/me/active-pathway`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(active.body.progress.completed).toBe(1);
      expect(
        active.body.steps.find((s: { id: string }) => s.id === first.id).status,
      ).toBe('COMPLETED');
    });

    it('allows a RETIRED career the user saved', async () => {
      const user = await registerUser('retired');
      const [retiredStep] = await stepsOf(prisma, catalog.retiredCareerId);
      await prisma.userPathway.create({
        data: {
          userId: user.id,
          careerId: catalog.retiredCareerId,
          isActive: true,
        },
      });

      await putStatus(user, retiredStep.id, { status: 'COMPLETED' }).expect(
        200,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Reads and isolation
  // ──────────────────────────────────────────────────────────────
  describe('reads and isolation', () => {
    it('both pathway reads reflect the new status and agree on totals', async () => {
      const user = await registerUser('reads');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(user, catalog.publishedCareerId);

      const put = await putStatus(user, first.id, {
        status: 'COMPLETED',
      }).expect(200);

      const active = await request(app.getHttpServer())
        .get(`${apiPrefix}/me/active-pathway`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      const saved = await request(app.getHttpServer())
        .get(`${apiPrefix}/me/pathways`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(active.body.progress).toEqual(put.body.progress);
      expect(saved.body[0].progress).toEqual({
        completed: put.body.progress.completed,
        total: put.body.progress.total,
        percentage: put.body.progress.percentage,
      });
    });

    it("never changes another user's progress", async () => {
      const userA = await registerUser('isolation-a');
      const userB = await registerUser('isolation-b');
      const [first] = await stepsOf(prisma, catalog.publishedCareerId);
      await save(userA, catalog.publishedCareerId);
      await save(userB, catalog.publishedCareerId);

      await putStatus(userB, first.id, { status: 'COMPLETED' }).expect(200);

      const aActive = await request(app.getHttpServer())
        .get(`${apiPrefix}/me/active-pathway`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);

      expect(aActive.body.progress.completed).toBe(0);
      await expect(
        prisma.userPathwayStep.count({ where: { userId: userA.id } }),
      ).resolves.toBe(0);
    });
  });
});
