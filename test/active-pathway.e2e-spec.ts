import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { CareerStatus } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from './utils/auth';

describe('Active pathway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let user: RegisteredUser;

  let fieldId: string;
  let careerWithPathwayId: string;
  let secondCareerWithPathwayId: string;
  let publishedCareerNoPathwayId: string;
  let draftCareerId: string;
  let retiredCareerId: string;

  const activePathwayUrl = () => `${apiPrefix}/me/active-pathway`;
  const auth = (req: request.Test) =>
    req.set('Authorization', `Bearer ${user.accessToken}`);
  const timestamp = Date.now();

  const createCareer = async (
    status: CareerStatus,
    slugSuffix: string,
    withPathway: boolean,
  ) => {
    const career = await prisma.career.create({
      data: {
        slug: `e2e-active-pathway-${slugSuffix}-${timestamp}`,
        title: `Test Career ${slugSuffix} ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        status,
        ...(status === CareerStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    if (withPathway) {
      await prisma.pathway.create({
        data: {
          careerId: career.id,
          title: `Pathway for ${slugSuffix}`,
          steps: {
            create: [
              {
                title: 'Step 1',
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order: 1,
              },
              {
                title: 'Step 2',
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order: 2,
              },
            ],
          },
        },
      });
    }

    return career.id;
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

    await app.init();
    prisma = app.get(PrismaService);
    wireNotificationMock();

    const field = await prisma.field.create({
      data: {
        name: `E2E Active Pathway ${Date.now()}`,
        slug: `e2e-ap-${Date.now()}`,
      },
    });
    fieldId = field.id;

    careerWithPathwayId = await createCareer(CareerStatus.PUBLISHED, 'a', true);
    secondCareerWithPathwayId = await createCareer(
      CareerStatus.PUBLISHED,
      'b',
      true,
    );
    publishedCareerNoPathwayId = await createCareer(
      CareerStatus.PUBLISHED,
      'c',
      false,
    );
    draftCareerId = await createCareer(CareerStatus.DRAFT, 'd', true);
    retiredCareerId = await createCareer(CareerStatus.RETIRED, 'e', true);

    user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-active-pathway-${Date.now()}@test.com`,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /me/active-pathway with none set', () => {
    it('returns the null-shaped 200 body', async () => {
      const freshUser = await registerAndVerify(app, apiPrefix, {
        email: `e2e-no-active-${Date.now()}@test.com`,
      });

      const response = await request(app.getHttpServer())
        .get(activePathwayUrl())
        .set('Authorization', `Bearer ${freshUser.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        career: null,
        pathway: null,
        progress: null,
        steps: [],
      });
    });
  });

  describe('PUT /me/active-pathway', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .put(activePathwayUrl())
        .send({ careerId: careerWithPathwayId })
        .expect(401);
    });

    it('rejects an invalid careerId in the standard validation format', async () => {
      const response = await auth(
        request(app.getHttpServer()).put(activePathwayUrl()),
      )
        .send({ careerId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty('careerId');
    });

    it('returns 404 for a DRAFT career', async () => {
      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: draftCareerId })
        .expect(404);
    });

    it('returns 404 for a RETIRED career (cannot be newly selected)', async () => {
      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: retiredCareerId })
        .expect(404);
    });

    it('returns 404 for an unknown career', async () => {
      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('returns 409 for a PUBLISHED career with no pathway', async () => {
      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: publishedCareerNoPathwayId })
        .expect(409);
    });

    it('activates the pathway and matches the GET response', async () => {
      const putResponse = await auth(
        request(app.getHttpServer()).put(activePathwayUrl()),
      )
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      expect(putResponse.body.career.id).toBe(careerWithPathwayId);
      expect(putResponse.body.career.retired).toBe(false);
      expect(putResponse.body.steps).toHaveLength(2);
      expect(putResponse.body.progress).toEqual({
        completed: 0,
        total: 2,
        percentage: 0,
        nextStepId: putResponse.body.steps[0].id,
        selfReported: false,
      });

      const getResponse = await auth(
        request(app.getHttpServer()).get(activePathwayUrl()),
      ).expect(200);

      expect(getResponse.body).toEqual(putResponse.body);
    });

    it('is idempotent: setting the same career twice gives identical state with no error', async () => {
      const first = await auth(
        request(app.getHttpServer()).put(activePathwayUrl()),
      )
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      const second = await auth(
        request(app.getHttpServer()).put(activePathwayUrl()),
      )
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      expect(second.body).toEqual(first.body);

      const activeRows = await prisma.userPathway.findMany({
        where: { userId: user.id, isActive: true },
      });
      expect(activeRows).toHaveLength(1);
    });

    it('switches active pathway, deactivating the previous one, and leaves step progress untouched', async () => {
      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      const firstUserPathway = await prisma.userPathway.findUniqueOrThrow({
        where: {
          userId_careerId: { userId: user.id, careerId: careerWithPathwayId },
        },
      });

      const firstStep = await prisma.pathwayStep.findFirstOrThrow({
        where: { pathway: { careerId: careerWithPathwayId } },
        orderBy: { order: 'asc' },
      });

      await prisma.userPathwayStep.create({
        data: {
          userId: user.id,
          pathwayStepId: firstStep.id,
          status: 'COMPLETED',
        },
      });

      await auth(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: secondCareerWithPathwayId })
        .expect(200);

      const rows = await prisma.userPathway.findMany({
        where: { userId: user.id },
      });

      expect(
        rows.find((r) => r.careerId === careerWithPathwayId)?.isActive,
      ).toBe(false);
      expect(
        rows.find((r) => r.careerId === secondCareerWithPathwayId)?.isActive,
      ).toBe(true);

      // UserPathwayStep rows are untouched by switching
      const step = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: {
            userId: user.id,
            pathwayStepId: firstStep.id,
          },
        },
      });
      expect(step.status).toBe('COMPLETED');

      // Switching back reflects that earlier progress
      const switchBack = await auth(
        request(app.getHttpServer()).put(activePathwayUrl()),
      )
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      expect(switchBack.body.progress.completed).toBe(1);
      expect(switchBack.body.progress.selfReported).toBe(true);

      void firstUserPathway; // referenced only to establish the row exists above
    });

    it('never leaves two active rows under concurrent switches', async () => {
      const concurrentUser = await registerAndVerify(app, apiPrefix, {
        email: `e2e-concurrent-${Date.now()}@test.com`,
      });
      const authConcurrent = (req: request.Test) =>
        req.set('Authorization', `Bearer ${concurrentUser.accessToken}`);

      const statuses: number[] = [];

      for (let round = 0; round < 10; round++) {
        const responses = await Promise.all(
          [careerWithPathwayId, secondCareerWithPathwayId].map((careerId) =>
            authConcurrent(
              request(app.getHttpServer()).put(activePathwayUrl()),
            ).send({ careerId }),
          ),
        );

        statuses.push(...responses.map((response) => response.status));
      }

      expect(statuses.every((status) => status === 200)).toBe(true);

      const activeRows = await prisma.userPathway.findMany({
        where: { userId: concurrentUser.id, isActive: true },
      });

      expect(activeRows).toHaveLength(1);
    });

    it("cannot change another user's active pathway", async () => {
      const otherUser = await registerAndVerify(app, apiPrefix, {
        email: `e2e-other-${Date.now()}@test.com`,
      });

      await request(app.getHttpServer())
        .put(activePathwayUrl())
        .set('Authorization', `Bearer ${otherUser.accessToken}`)
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      const mine = await auth(
        request(app.getHttpServer()).get(activePathwayUrl()),
      ).expect(200);

      // "mine" still reflects this user's own prior switches, never otherUser's
      expect(mine.body.career?.id).not.toBeUndefined();

      const otherRows = await prisma.userPathway.findMany({
        where: { userId: otherUser.id, isActive: true },
      });
      expect(otherRows).toHaveLength(1);
      expect(otherRows[0].careerId).toBe(careerWithPathwayId);
    });
  });

  describe('GET /me/active-pathway auth and isolation', () => {
    it('returns 401 with no token', async () => {
      await request(app.getHttpServer()).get(activePathwayUrl()).expect(401);
    });

    it('returns 401 with a garbage token', async () => {
      await request(app.getHttpServer())
        .get(activePathwayUrl())
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it("returns only the caller's own active pathway, not another user's", async () => {
      const userA = await registerAndVerify(app, apiPrefix, {
        email: `e2e-get-isolation-a-${Date.now()}@test.com`,
      });
      const userB = await registerAndVerify(app, apiPrefix, {
        email: `e2e-get-isolation-b-${Date.now()}@test.com`,
      });

      await request(app.getHttpServer())
        .put(activePathwayUrl())
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      await request(app.getHttpServer())
        .put(activePathwayUrl())
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ careerId: secondCareerWithPathwayId })
        .expect(200);

      const aResponse = await request(app.getHttpServer())
        .get(activePathwayUrl())
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);

      const bResponse = await request(app.getHttpServer())
        .get(activePathwayUrl())
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(200);

      expect(aResponse.body.career.id).toBe(careerWithPathwayId);
      expect(bResponse.body.career.id).toBe(secondCareerWithPathwayId);
    });
  });

  describe('GET /me/pathways', () => {
    const savedPathwaysUrl = () => `${apiPrefix}/me/pathways`;

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get(savedPathwaysUrl()).expect(401);
    });

    it('returns an empty array when nothing is saved', async () => {
      const freshUser = await registerAndVerify(app, apiPrefix, {
        email: `e2e-no-saved-${Date.now()}@test.com`,
      });

      const response = await request(app.getHttpServer())
        .get(savedPathwaysUrl())
        .set('Authorization', `Bearer ${freshUser.accessToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('lists saved pathways with progress, marking the active one, and shows retired: true', async () => {
      const savedUser = await registerAndVerify(app, apiPrefix, {
        email: `e2e-saved-list-${Date.now()}@test.com`,
      });
      const authSaved = (req: request.Test) =>
        req.set('Authorization', `Bearer ${savedUser.accessToken}`);

      await authSaved(request(app.getHttpServer()).put(activePathwayUrl()))
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      await prisma.userPathway.create({
        data: {
          userId: savedUser.id,
          careerId: retiredCareerId,
          isActive: false,
        },
      });

      const response = await authSaved(
        request(app.getHttpServer()).get(savedPathwaysUrl()),
      ).expect(200);

      expect(response.body).toHaveLength(2);

      const active = response.body.find(
        (p: { isActive: boolean }) => p.isActive,
      );
      const retired = response.body.find(
        (p: { career: { retired: boolean } }) => p.career.retired,
      );

      expect(active.career.id).toBe(careerWithPathwayId);
      expect(active.progress).toEqual(
        expect.objectContaining({ completed: 0, total: 2, percentage: 0 }),
      );
      expect(retired.career.id).toBe(retiredCareerId);
      expect(retired.isActive).toBe(false);
    });

    it("does not return another user's saved pathways", async () => {
      const userA = await registerAndVerify(app, apiPrefix, {
        email: `e2e-saved-isolation-a-${Date.now()}@test.com`,
      });
      const userB = await registerAndVerify(app, apiPrefix, {
        email: `e2e-saved-isolation-b-${Date.now()}@test.com`,
      });

      await request(app.getHttpServer())
        .put(activePathwayUrl())
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ careerId: careerWithPathwayId })
        .expect(200);

      const bResponse = await request(app.getHttpServer())
        .get(savedPathwaysUrl())
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(200);

      expect(bResponse.body).toEqual([]);
    });
  });
});
