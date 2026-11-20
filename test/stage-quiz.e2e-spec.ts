import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
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

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Stage quiz read (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;
  let stageWithoutQuizId: string;
  let otherPathwayId: string;
  let otherPathwayStageId: string;
  let retiredStageId: string;

  const marker = `e2e-stage-quiz-${Date.now()}`;
  const userIds: string[] = [];

  const quizUrl = (pathwayId: string, stageId: string) =>
    `${apiPrefix}/pathways/${pathwayId}/stages/${stageId}/quiz`;

  const getQuiz = (
    pathwayId: string,
    stageId: string,
    token = user.accessToken,
  ) =>
    request(app.getHttpServer())
      .get(quizUrl(pathwayId, stageId))
      .set('Authorization', `Bearer ${token}`);

  const stageOf = (careerId: string, order: number) =>
    prisma.pathwayStage.findFirstOrThrow({
      where: { pathway: { careerId }, order },
      select: { id: true, pathwayId: true },
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
    prisma = app.get(PrismaService);
    await app.listen(0, '127.0.0.1');

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}@test.com`,
    });
    userIds.push(user.id);

    // The seeded quiz has one question. Bring it to five, four options each,
    // with the correct option in a different place each time.
    for (let order = 2; order <= 5; order++) {
      await prisma.quizQuestion.create({
        data: {
          quizId: catalog.stageQuizId,
          prompt: `Question ${order}?`,
          order,
          correctIndex: order % 4,
          options: {
            create: ['A', 'B', 'C', 'D'].map((text, i) => ({ text, order: i })),
          },
        },
      });
    }

    stageWithoutQuizId = (await stageOf(catalog.publishedCareerId, 2)).id;
    ({ id: otherPathwayStageId, pathwayId: otherPathwayId } = await stageOf(
      catalog.secondPublishedCareerId,
      1,
    ));
    retiredStageId = (await stageOf(catalog.retiredCareerId, 1)).id;
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  describe('GET /pathways/:id/stages/:stageId/quiz', () => {
    it('returns five questions with four options each', async () => {
      const response = await getQuiz(
        catalog.publishedPathwayId,
        catalog.firstStageId,
      ).expect(200);

      expect(response.body).toMatchObject({
        id: catalog.stageQuizId,
        stageId: catalog.firstStageId,
      });
      expect(response.body.questions).toHaveLength(5);
      for (const question of response.body.questions) {
        expect(question.options).toHaveLength(4);
      }
    });

    it('lists questions and options in display order', async () => {
      const response = await getQuiz(
        catalog.publishedPathwayId,
        catalog.firstStageId,
      ).expect(200);

      expect(
        response.body.questions.map((q: { prompt: string }) => q.prompt),
      ).toEqual([
        'Which option is right?',
        'Question 2?',
        'Question 3?',
        'Question 4?',
        'Question 5?',
      ]);
      expect(
        response.body.questions[0].options.map((o: { text: string }) => o.text),
      ).toEqual(['A', 'B', 'C', 'D']);
    });

    it('has no answers in the body, only ids, prompts and option text', async () => {
      const response = await getQuiz(
        catalog.publishedPathwayId,
        catalog.firstStageId,
      ).expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(/correct/i);
      for (const question of response.body.questions) {
        expect(Object.keys(question).sort()).toEqual([
          'id',
          'options',
          'prompt',
        ]);
        for (const option of question.options) {
          expect(Object.keys(option).sort()).toEqual(['id', 'text']);
        }
      }
    });

    it('can be loaded again after a pass, so the quiz can be retaken', async () => {
      await prisma.quizAttempt.create({
        data: {
          userId: user.id,
          stageQuizId: catalog.stageQuizId,
          correct: 5,
          total: 5,
        },
      });

      const response = await getQuiz(
        catalog.publishedPathwayId,
        catalog.firstStageId,
      ).expect(200);

      expect(response.body.questions).toHaveLength(5);
      expect(JSON.stringify(response.body)).not.toMatch(/correct/i);
    });

    it('writes nothing: no step marks and no XP', async () => {
      const reader = await registerAndVerify(app, apiPrefix, {
        email: `${marker}-reader@test.com`,
      });
      userIds.push(reader.id);

      await getQuiz(
        catalog.publishedPathwayId,
        catalog.firstStageId,
        reader.accessToken,
      ).expect(200);

      expect(
        await prisma.userPathwayStep.count({ where: { userId: reader.id } }),
      ).toBe(0);
      expect(
        await prisma.activityLedger.count({ where: { userId: reader.id } }),
      ).toBe(0);
      expect(
        await prisma.quizAttempt.count({ where: { userId: reader.id } }),
      ).toBe(0);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .get(quizUrl(catalog.publishedPathwayId, catalog.firstStageId))
        .expect(401);
    });

    it("returns 404 for another pathway's stage", async () => {
      await getQuiz(catalog.publishedPathwayId, otherPathwayStageId).expect(
        404,
      );
      await getQuiz(otherPathwayId, catalog.firstStageId).expect(404);
    });

    it('returns 404 for a stage with no quiz', async () => {
      const response = await getQuiz(
        catalog.publishedPathwayId,
        stageWithoutQuizId,
      ).expect(404);

      expect(response.body.message).toBe('Quiz not found');
    });

    it('returns 404 for a stage or pathway that does not exist', async () => {
      await getQuiz(catalog.publishedPathwayId, UNKNOWN_ID).expect(404);
      await getQuiz(UNKNOWN_ID, catalog.firstStageId).expect(404);
    });

    it('returns 404 for a draft career', async () => {
      const draftStage = await stageOf(catalog.draftCareerId, 1);

      await getQuiz(draftStage.pathwayId, draftStage.id).expect(404);
    });

    it('returns 404 for a retired career the caller has not saved, and 200 once saved', async () => {
      await getQuiz(catalog.retiredPathwayId, retiredStageId).expect(404);

      await prisma.userPathway.create({
        data: { userId: user.id, careerId: catalog.retiredCareerId },
      });

      await getQuiz(catalog.retiredPathwayId, retiredStageId).expect(200);
    });

    it.each([
      ['a pathway id', 'pathway-1', 'stage-1'],
      ['a stage id', null, 'stage-1'],
    ])(
      'returns 400 for %s that is not a UUID',
      async (_label, pathway, stage) => {
        await getQuiz(pathway ?? catalog.publishedPathwayId, stage).expect(400);
      },
    );
  });
});
