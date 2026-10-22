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

describe('Saved pathway starting point (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let fieldId: string;
  let careerId: string;
  let otherCareerId: string;
  let retiredCareerId: string;

  const timestamp = Date.now();
  const createdUserIds: string[] = [];
  const createdCareerIds: string[] = [];

  const registerUser = async (label: string) => {
    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-start-point-${label}-${Date.now()}@test.com`,
    });
    createdUserIds.push(registered.id);
    return registered;
  };

  const createCareer = async (status: CareerStatus, slugSuffix: string) => {
    const career = await prisma.career.create({
      data: {
        slug: `e2e-start-point-${slugSuffix}-${timestamp}`,
        title: `Starting Point Career ${slugSuffix} ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        status,
        ...(status === CareerStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
        pathway: {
          create: {
            title: `Pathway ${slugSuffix}`,
            steps: {
              create: [1, 2, 3].map((order) => ({
                title: `Step ${order}`,
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order,
              })),
            },
          },
        },
      },
    });
    createdCareerIds.push(career.id);
    return career.id;
  };

  const stepsOf = (id: string) =>
    prisma.pathwayStep.findMany({
      where: { pathway: { careerId: id } },
      orderBy: { order: 'asc' },
    });

  const putStart = (user: RegisteredUser, id: string, body: object) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/pathways/${id}/starting-point`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);

  const save = (user: RegisteredUser, id: string) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId: id })
      .expect(200);

  const getActive = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

  const savedRow = (user: RegisteredUser, id: string) =>
    prisma.userPathway.findUniqueOrThrow({
      where: { userId_careerId: { userId: user.id, careerId: id } },
    });

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
        name: `E2E Starting Point ${timestamp}`,
        slug: `e2e-stp-${timestamp}`,
      },
    });
    fieldId = field.id;

    careerId = await createCareer(CareerStatus.PUBLISHED, 'a');
    otherCareerId = await createCareer(CareerStatus.PUBLISHED, 'b');
    retiredCareerId = await createCareer(CareerStatus.RETIRED, 'r');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.career.deleteMany({ where: { id: { in: createdCareerIds } } });

    if (fieldId) {
      await prisma.field.delete({ where: { id: fieldId } });
    }

    await app.close();
  });

  describe('validation and access', () => {
    let user: RegisteredUser;

    beforeAll(async () => {
      user = await registerUser('validation');
      await save(user, careerId);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .put(`${apiPrefix}/me/pathways/${careerId}/starting-point`)
        .send({ stepId: null })
        .expect(401);
    });

    it('returns 400 for an invalid careerId', async () => {
      await putStart(user, 'not-a-uuid', { stepId: null }).expect(400);
    });

    it.each([
      ['missing', {}],
      ['not a UUID', { stepId: 'step-2' }],
    ])(
      'returns 400 in the standard validation format for a %s stepId',
      async (_label, body) => {
        const response = await putStart(user, careerId, body).expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.fields).toHaveProperty('stepId');
      },
    );

    it("returns 404 for a career the user hasn't saved", async () => {
      const [step] = await stepsOf(otherCareerId);

      await putStart(user, otherCareerId, { stepId: step.id }).expect(404);
    });

    it("rejects a step from another career's pathway, changing nothing", async () => {
      const [foreignStep] = await stepsOf(otherCareerId);

      const response = await putStart(user, careerId, {
        stepId: foreignStep.id,
      }).expect(400);

      expect(response.body.error).toBe('BAD_REQUEST');
      expect((await savedRow(user, careerId)).startStepId).toBeNull();
    });

    it("can't change another user's saved pathway", async () => {
      const intruder = await registerUser('intruder');
      const [, second] = await stepsOf(careerId);

      await putStart(intruder, careerId, { stepId: second.id }).expect(404);

      expect((await savedRow(user, careerId)).startStepId).toBeNull();
    });
  });

  describe('setting, changing and clearing', () => {
    it('sets the starting point without touching isActive or step progress', async () => {
      const user = await registerUser('set');
      const [first, second] = await stepsOf(careerId);
      await save(user, careerId);
      await prisma.userPathwayStep.create({
        data: { userId: user.id, pathwayStepId: first.id, status: 'COMPLETED' },
      });

      const response = await putStart(user, careerId, {
        stepId: second.id,
      }).expect(200);

      expect(response.body).toEqual({
        careerId,
        startStepId: second.id,
        progress: {
          completed: 1,
          total: 3,
          percentage: 33,
          nextStepId: second.id,
          selfReported: true,
          startStepId: second.id,
        },
      });

      const row = await savedRow(user, careerId);
      expect(row.startStepId).toBe(second.id);
      expect(row.isActive).toBe(true);
      const progressRow = await prisma.userPathwayStep.findUniqueOrThrow({
        where: {
          userId_pathwayStepId: { userId: user.id, pathwayStepId: first.id },
        },
      });
      expect(progressRow.status).toBe('COMPLETED');
    });

    it('is idempotent and can be changed and cleared', async () => {
      const user = await registerUser('change');
      const [first, second, third] = await stepsOf(careerId);
      await save(user, careerId);

      const once = await putStart(user, careerId, {
        stepId: second.id,
      }).expect(200);
      const twice = await putStart(user, careerId, {
        stepId: second.id,
      }).expect(200);
      expect(twice.body).toEqual(once.body);

      const changed = await putStart(user, careerId, {
        stepId: third.id,
      }).expect(200);
      expect(changed.body.progress.nextStepId).toBe(third.id);

      const cleared = await putStart(user, careerId, {
        stepId: null,
      }).expect(200);
      expect(cleared.body.startStepId).toBeNull();
      expect(cleared.body.progress.nextStepId).toBe(first.id);
      expect((await savedRow(user, careerId)).startStepId).toBeNull();
    });

    it('falls back to the earliest incomplete step when none remain from the start', async () => {
      const user = await registerUser('fallback');
      const [first, second, third] = await stepsOf(careerId);
      await save(user, careerId);
      await prisma.userPathwayStep.createMany({
        data: [second, third].map((step) => ({
          userId: user.id,
          pathwayStepId: step.id,
          status: 'COMPLETED' as const,
        })),
      });

      const response = await putStart(user, careerId, {
        stepId: second.id,
      }).expect(200);

      expect(response.body.progress).toMatchObject({
        completed: 2,
        total: 3,
        nextStepId: first.id,
      });
    });

    it('works on a saved pathway that is not active, and leaves it inactive', async () => {
      const user = await registerUser('inactive');
      const [, second] = await stepsOf(careerId);
      await save(user, careerId);
      await save(user, otherCareerId);

      await putStart(user, careerId, { stepId: second.id }).expect(200);

      const row = await savedRow(user, careerId);
      expect(row.isActive).toBe(false);
      expect(row.startStepId).toBe(second.id);
      expect((await savedRow(user, otherCareerId)).isActive).toBe(true);
    });

    it('works on a RETIRED career the user saved', async () => {
      const user = await registerUser('retired');
      const [, second] = await stepsOf(retiredCareerId);
      await prisma.userPathway.create({
        data: { userId: user.id, careerId: retiredCareerId, isActive: true },
      });

      await putStart(user, retiredCareerId, { stepId: second.id }).expect(200);
    });
  });

  describe('reads', () => {
    it('both read endpoints reflect the starting point and agree on totals', async () => {
      const user = await registerUser('reads');
      const [, second] = await stepsOf(careerId);
      await save(user, careerId);

      const put = await putStart(user, careerId, {
        stepId: second.id,
      }).expect(200);

      const active = await getActive(user);
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

    it('deleting the chosen step clears the starting point without breaking reads', async () => {
      const temporaryCareerId = await createCareer(
        CareerStatus.PUBLISHED,
        'delete',
      );
      const user = await registerUser('delete');
      const [first, second] = await stepsOf(temporaryCareerId);
      await save(user, temporaryCareerId);
      await putStart(user, temporaryCareerId, { stepId: second.id }).expect(
        200,
      );

      await prisma.pathwayStep.delete({ where: { id: second.id } });

      const active = await getActive(user);
      expect(active.body.progress).toMatchObject({
        startStepId: null,
        nextStepId: first.id,
        total: 2,
      });
    });
  });
});
