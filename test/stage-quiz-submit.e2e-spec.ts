import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ActivityService } from '../src/activity';
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

interface Answer {
  questionId: string;
  optionId: string;
}

describe('Stage quiz submit and result (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activity: ActivityService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let stageWithoutQuizId: string;
  let otherPathwayStageId: string;
  let retiredStageId: string;
  // Per question, in order: which option is right, and a wrong one
  let choices: Array<{ questionId: string; right: string; wrong: string }>;

  const marker = `e2e-quiz-submit-${Date.now()}`;
  const userIds: string[] = [];
  let counter = 0;

  const quizUrl = (pathwayId: string, stageId: string, tail = '') =>
    `${apiPrefix}/pathways/${pathwayId}/stages/${stageId}/quiz${tail}`;

  const submit = (user: RegisteredUser, answers: Answer[]) =>
    request(app.getHttpServer())
      .post(
        quizUrl(catalog.publishedPathwayId, catalog.firstStageId, '/submit'),
      )
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ answers });

  const getResult = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .get(quizUrl(catalog.publishedPathwayId, catalog.firstStageId, '/result'))
      .set('Authorization', `Bearer ${user.accessToken}`);

  // A user who has saved the published career, unless said otherwise
  const newUser = async (save = true): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-${++counter}@test.com`,
    });
    userIds.push(user.id);
    if (save) {
      await prisma.userPathway.create({
        data: { userId: user.id, careerId: catalog.publishedCareerId },
      });
    }
    return user;
  };

  // Right on every question except the given ones (1-based)
  const answers = (wrongQuestions: number[] = []): Answer[] =>
    choices.map(({ questionId, right, wrong }, i) => ({
      questionId,
      optionId: wrongQuestions.includes(i + 1) ? wrong : right,
    }));

  const attemptsOf = (userId: string) =>
    prisma.quizAttempt.count({
      where: { userId, stageQuizId: catalog.stageQuizId },
    });

  const quizXpRowsOf = (userId: string) =>
    prisma.activityLedger.count({
      where: { userId, referenceId: catalog.stageQuizId },
    });

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
    activity = app.get(ActivityService);
    await app.listen(0, '127.0.0.1');

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });

    // The seeded quiz has one question. Bring it to five, four options each.
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

    // Questions 2 and 4 point at a step, the others at none
    await prisma.quizQuestion.updateMany({
      where: { quizId: catalog.stageQuizId },
      data: { stepId: null },
    });
    await prisma.quizQuestion.update({
      where: { quizId_order: { quizId: catalog.stageQuizId, order: 2 } },
      data: { stepId: catalog.secondStepId },
    });
    await prisma.quizQuestion.update({
      where: { quizId_order: { quizId: catalog.stageQuizId, order: 4 } },
      data: { stepId: catalog.thirdStepId },
    });

    const questions = await prisma.quizQuestion.findMany({
      where: { quizId: catalog.stageQuizId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        correctIndex: true,
        options: { orderBy: { order: 'asc' }, select: { id: true } },
      },
    });
    choices = questions.map(({ id, correctIndex, options }) => ({
      questionId: id,
      right: options[correctIndex].id,
      wrong: options[(correctIndex + 1) % 4].id,
    }));

    stageWithoutQuizId = (await stageOf(catalog.publishedCareerId, 2)).id;
    otherPathwayStageId = (await stageOf(catalog.secondPublishedCareerId, 1))
      .id;
    retiredStageId = (await stageOf(catalog.retiredCareerId, 1)).id;
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  describe('POST /pathways/:id/stages/:stageId/quiz/submit', () => {
    it('grades, stores an attempt and awards 20 XP on the first submit', async () => {
      const user = await newUser();

      const response = await submit(user, answers()).expect(201);

      expect(response.body).toEqual({
        quizId: catalog.stageQuizId,
        score: { correct: 5, total: 5 },
        passed: true,
        xpAwarded: 20,
        nextStepId: catalog.firstStepId,
        revisitStepId: null,
        submittedAt: expect.any(String),
        streak: {
          current: expect.any(Number),
          longest: expect.any(Number),
        },
        breakdown: expect.any(Array),
      });
      expect(response.body.breakdown).toHaveLength(5);
      expect(await attemptsOf(user.id)).toBe(1);
      expect(await quizXpRowsOf(user.id)).toBe(1);
    });

    it('returns a breakdown with the answer texts', async () => {
      const user = await newUser();

      const response = await submit(user, answers([3])).expect(201);

      const item = response.body.breakdown[2];
      expect(Object.keys(item).sort()).toEqual([
        'correctOptionId',
        'correctOptionText',
        'isCorrect',
        'prompt',
        'questionId',
        'selectedOptionId',
        'selectedOptionText',
      ]);
      expect(item).toMatchObject({
        questionId: choices[2].questionId,
        prompt: 'Question 3?',
        selectedOptionId: choices[2].wrong,
        correctOptionId: choices[2].right,
        isCorrect: false,
      });
      expect(item.selectedOptionText).not.toBe(item.correctOptionText);
      expect(response.body.breakdown[0].isCorrect).toBe(true);
    });

    it('awards 0 XP on a retake, and stores the attempt', async () => {
      const user = await newUser();

      await submit(user, answers()).expect(201);
      const retake = await submit(user, answers([1])).expect(201);

      expect(retake.body.xpAwarded).toBe(0);
      expect(retake.body.score).toEqual({ correct: 4, total: 5 });
      expect(await attemptsOf(user.id)).toBe(2);
      expect(await quizXpRowsOf(user.id)).toBe(1);
    });

    it('awards the same XP to a failed first submit, and none after', async () => {
      const user = await newUser();

      const first = await submit(user, answers([1, 2, 3, 4, 5])).expect(201);
      const second = await submit(user, answers()).expect(201);

      expect(first.body).toMatchObject({
        score: { correct: 0, total: 5 },
        passed: false,
        xpAwarded: 20,
      });
      expect(second.body.xpAwarded).toBe(0);
    });

    it('points the revisit step at the first wrong question that has a step', async () => {
      const user = await newUser();

      // Question 1 has no step. Question 2 is the first wrong one with a step.
      const response = await submit(user, answers([1, 2, 4])).expect(201);
      expect(response.body.revisitStepId).toBe(catalog.secondStepId);

      const later = await submit(user, answers([4])).expect(201);
      expect(later.body.revisitStepId).toBe(catalog.thirdStepId);

      const none = await submit(user, answers([1, 3, 5])).expect(201);
      expect(none.body.revisitStepId).toBeNull();
    });

    it('counts an unanswered question as wrong', async () => {
      const user = await newUser();

      const response = await submit(user, answers().slice(0, 4)).expect(201);

      expect(response.body.score).toEqual({ correct: 4, total: 5 });
      expect(response.body.breakdown[4]).toMatchObject({
        selectedOptionId: null,
        selectedOptionText: null,
        isCorrect: false,
      });
    });

    it('never completes a step', async () => {
      const user = await newUser();

      await submit(user, answers()).expect(201);

      expect(
        await prisma.userPathwayStep.count({ where: { userId: user.id } }),
      ).toBe(0);
    });

    it('stores no attempt and no XP when the write fails', async () => {
      const user = await newUser();
      const spy = jest
        .spyOn(activity, 'awardEarnedBadges')
        .mockRejectedValueOnce(new Error('badges down'));

      try {
        await submit(user, answers()).expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(await attemptsOf(user.id)).toBe(0);
      expect(await quizXpRowsOf(user.id)).toBe(0);

      // Nothing was left behind, so the first submit still awards the XP
      const response = await submit(user, answers()).expect(201);
      expect(response.body.xpAwarded).toBe(20);
    });

    it('returns 409 and writes nothing when the career is not saved', async () => {
      const user = await newUser(false);

      await submit(user, answers()).expect(409);

      expect(await attemptsOf(user.id)).toBe(0);
      expect(await quizXpRowsOf(user.id)).toBe(0);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .post(
          quizUrl(catalog.publishedPathwayId, catalog.firstStageId, '/submit'),
        )
        .send({ answers: answers() })
        .expect(401);
    });

    it("returns 404 for another pathway's stage, a stage with no quiz, and unknown ids", async () => {
      const user = await newUser();
      const post = (pathwayId: string, stageId: string) =>
        request(app.getHttpServer())
          .post(quizUrl(pathwayId, stageId, '/submit'))
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ answers: answers() });

      await post(catalog.publishedPathwayId, otherPathwayStageId).expect(404);
      await post(catalog.publishedPathwayId, stageWithoutQuizId).expect(404);
      await post(catalog.publishedPathwayId, UNKNOWN_ID).expect(404);
      await post(UNKNOWN_ID, catalog.firstStageId).expect(404);
      expect(await attemptsOf(user.id)).toBe(0);
    });

    it('returns 404 for a retired career that is not saved, and 201 once saved', async () => {
      const user = await newUser(false);
      const retiredQuiz = await prisma.stageQuiz.findFirstOrThrow({
        where: { stageId: retiredStageId },
        select: {
          questions: {
            select: { id: true, options: { select: { id: true } } },
          },
        },
      });
      const [question] = retiredQuiz.questions;
      const post = () =>
        request(app.getHttpServer())
          .post(quizUrl(catalog.retiredPathwayId, retiredStageId, '/submit'))
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            answers: [
              { questionId: question.id, optionId: question.options[0].id },
            ],
          });

      await post().expect(404);

      await prisma.userPathway.create({
        data: { userId: user.id, careerId: catalog.retiredCareerId },
      });

      await post().expect(201);
    });

    it.each([
      ['no body', undefined],
      ['no answers', { answers: [] }],
      ['answers that are not a list', { answers: 'x' }],
      [
        'an answer with an id that is not a UUID',
        {
          answers: [{ questionId: 'q1', optionId: 'o1' }],
        },
      ],
      [
        'an answer with no option',
        {
          answers: [{ questionId: UNKNOWN_ID }],
        },
      ],
    ])('returns 400 for %s', async (_label, body) => {
      const user = await newUser();

      await request(app.getHttpServer())
        .post(
          quizUrl(catalog.publishedPathwayId, catalog.firstStageId, '/submit'),
        )
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(body)
        .expect(400);

      expect(await attemptsOf(user.id)).toBe(0);
    });

    it('returns 400 for ids that are not UUIDs', async () => {
      const user = await newUser();

      await request(app.getHttpServer())
        .post(quizUrl('pathway-1', 'stage-1', '/submit'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ answers: answers() })
        .expect(400);
    });
  });

  describe('GET /pathways/:id/stages/:stageId/quiz/result', () => {
    it('returns 404 before any submit', async () => {
      const user = await newUser();

      await getResult(user).expect(404);
    });

    it('returns the latest attempt, and it survives a refresh', async () => {
      const user = await newUser();
      await submit(user, answers()).expect(201);
      await submit(user, answers([3])).expect(201);

      const first = await getResult(user).expect(200);
      const again = await getResult(user).expect(200);

      expect(first.body).toEqual({
        quizId: catalog.stageQuizId,
        score: { correct: 4, total: 5 },
        passed: true,
        revisitStepId: null,
        submittedAt: expect.any(String),
        breakdown: expect.any(Array),
      });
      expect(first.body.breakdown).toHaveLength(5);
      expect(first.body.breakdown[2]).toMatchObject({
        selectedOptionId: choices[2].wrong,
        correctOptionId: choices[2].right,
        isCorrect: false,
      });
      expect(again.body).toEqual(first.body);
    });

    it('has no XP field, and awards nothing', async () => {
      const user = await newUser();
      await submit(user, answers()).expect(201);
      const before = await quizXpRowsOf(user.id);

      const response = await getResult(user).expect(200);

      expect(response.body).not.toHaveProperty('xpAwarded');
      expect(JSON.stringify(response.body)).not.toMatch(/xp/i);
      expect(await quizXpRowsOf(user.id)).toBe(before);
    });

    it("does not return another user's attempt", async () => {
      const taker = await newUser();
      const other = await newUser();
      await submit(taker, answers()).expect(201);

      await getResult(other).expect(404);
    });

    it('is not found for an attempt stored before answers were kept', async () => {
      const user = await newUser();
      await prisma.quizAttempt.create({
        data: {
          userId: user.id,
          stageQuizId: catalog.stageQuizId,
          correct: 5,
          total: 5,
        },
      });

      await getResult(user).expect(404);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .get(
          quizUrl(catalog.publishedPathwayId, catalog.firstStageId, '/result'),
        )
        .expect(401);
    });

    it("returns 404 for another pathway's stage and a stage with no quiz", async () => {
      const user = await newUser();
      const get = (pathwayId: string, stageId: string) =>
        request(app.getHttpServer())
          .get(quizUrl(pathwayId, stageId, '/result'))
          .set('Authorization', `Bearer ${user.accessToken}`);

      await get(catalog.publishedPathwayId, otherPathwayStageId).expect(404);
      await get(catalog.publishedPathwayId, stageWithoutQuizId).expect(404);
    });

    it('returns 400 for ids that are not UUIDs', async () => {
      const user = await newUser();

      await request(app.getHttpServer())
        .get(quizUrl('pathway-1', 'stage-1', '/result'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(400);
    });
  });

  describe('progress tab quiz label', () => {
    it('shows the best score across attempts, not the latest', async () => {
      const user = await newUser();
      await submit(user, answers([1])).expect(201);
      await submit(user, answers()).expect(201);
      await submit(user, answers([1, 2, 3])).expect(201);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/pathways/${catalog.publishedPathwayId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const stage = response.body.stages.find(
        ({ id }: { id: string }) => id === catalog.firstStageId,
      );
      expect(stage.quiz).toEqual({
        status: 'TAKEN',
        score: { correct: 5, total: 5 },
      });
    });
  });
});
