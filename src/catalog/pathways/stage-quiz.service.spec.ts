import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from '../../activity';
import { PrismaService } from '../../prisma';
import type { StageQuizGradingRow } from './mappers/stage-quiz-result.mapper';
import { StageQuizService } from './stage-quiz.service';

describe('StageQuizService', () => {
  let service: StageQuizService;

  const fn = () => jest.fn<(args: unknown) => Promise<unknown>>();

  const mockPrisma = {
    pathway: { findFirst: fn() },
    stageQuiz: { findFirst: fn() },
    quizAttempt: { create: fn(), findFirst: fn() },
    pathwayStage: { findMany: fn() },
    userPathwayStep: { findMany: fn() },
    $transaction: jest.fn<(cb: (tx: unknown) => Promise<unknown>) => unknown>(),
  };

  const mockActivity = {
    recordQuizPassed:
      jest.fn<
        (userId: string, quizId: string, tx: unknown) => Promise<number>
      >(),
    awardEarnedBadges:
      jest.fn<(userId: string, tx: unknown) => Promise<unknown>>(),
    getUserStats: jest.fn<(userId: string) => Promise<unknown>>(),
  };

  const submittedAt = new Date('2026-11-20T10:00:00.000Z');

  // Five questions, four options each. The correct option is index 0.
  const quiz: StageQuizGradingRow = {
    id: 'quiz-1',
    stageId: 'stage-1',
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `q${n}`,
      prompt: `Question ${n}?`,
      correctIndex: 0,
      // Questions 2 and 4 point at a step
      stepId: n === 2 || n === 4 ? `step-${n}` : null,
      options: ['A', 'B', 'C', 'D'].map((text, order) => ({
        id: `q${n}-o${order}`,
        text,
        order,
      })),
    })),
  };

  const answersWith = (wrongQuestions: number[]) =>
    [1, 2, 3, 4, 5].map((n) => ({
      questionId: `q${n}`,
      optionId: wrongQuestions.includes(n) ? `q${n}-o1` : `q${n}-o0`,
    }));

  // A readable pathway, saved by the caller unless said otherwise
  const arrangeReadable = (saved = true) => {
    mockPrisma.pathway.findFirst.mockResolvedValue({
      careerId: 'career-1',
      career: { userPathways: saved ? [{ startStepId: null }] : [] },
    });
    mockPrisma.stageQuiz.findFirst.mockResolvedValue(quiz);
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma));
    mockPrisma.quizAttempt.create.mockResolvedValue({ submittedAt });
    mockPrisma.pathwayStage.findMany.mockResolvedValue([
      {
        id: 'stage-1',
        order: 1,
        steps: [{ id: 'step-1', order: 1 }],
      },
    ]);
    mockPrisma.userPathwayStep.findMany.mockResolvedValue([]);
    mockActivity.recordQuizPassed.mockResolvedValue(20);
    mockActivity.awardEarnedBadges.mockResolvedValue([]);
    mockActivity.getUserStats.mockResolvedValue({
      xp: 20,
      streak: { current: 1, longest: 1 },
      activityDays: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageQuizService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityService, useValue: mockActivity },
      ],
    }).compile();

    service = module.get(StageQuizService);
  });

  describe('submitStageQuiz', () => {
    it('stores the attempt and awards XP on the first submit', async () => {
      arrangeReadable();

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([]),
      );

      expect(mockPrisma.quizAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            stageQuizId: 'quiz-1',
            correct: 5,
            total: 5,
          }),
        }),
      );
      expect(mockActivity.recordQuizPassed).toHaveBeenCalledWith(
        'user-1',
        'quiz-1',
        mockPrisma,
      );
      expect(result).toMatchObject({
        quizId: 'quiz-1',
        score: { correct: 5, total: 5 },
        passed: true,
        xpAwarded: 20,
        streak: { current: 1, longest: 1 },
      });
    });

    it('awards 0 XP on a retake but still stores the attempt', async () => {
      arrangeReadable();
      mockActivity.recordQuizPassed.mockResolvedValue(0);

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([]),
      );

      expect(result.xpAwarded).toBe(0);
      expect(mockPrisma.quizAttempt.create).toHaveBeenCalledTimes(1);
      expect(mockActivity.awardEarnedBadges).not.toHaveBeenCalled();
    });

    it('awards badges only when XP was awarded', async () => {
      arrangeReadable();

      await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([]),
      );

      expect(mockActivity.awardEarnedBadges).toHaveBeenCalledWith(
        'user-1',
        mockPrisma,
      );
    });

    it('awards the same XP whatever the score', async () => {
      arrangeReadable();

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([1, 2, 3, 4, 5]),
      );

      expect(result).toMatchObject({
        score: { correct: 0, total: 5 },
        passed: false,
        xpAwarded: 20,
      });
    });

    it('takes the revisit step from the first wrong question that has a step', async () => {
      arrangeReadable();

      // Question 1 has no step, question 2 is the first wrong one with a step
      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([1, 2, 4]),
      );

      expect(result.revisitStepId).toBe('step-2');
    });

    it('has a null revisit step when no wrong question has a step', async () => {
      arrangeReadable();

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([1, 3, 5]),
      );

      expect(result.revisitStepId).toBeNull();
    });

    it('returns the breakdown with the answer texts', async () => {
      arrangeReadable();

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([3]),
      );

      expect(result.breakdown[2]).toEqual({
        questionId: 'q3',
        prompt: 'Question 3?',
        selectedOptionId: 'q3-o1',
        selectedOptionText: 'B',
        correctOptionId: 'q3-o0',
        correctOptionText: 'A',
        isCorrect: false,
      });
    });

    it("returns the next step from the user's progress", async () => {
      arrangeReadable();

      const result = await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([]),
      );

      expect(result.nextStepId).toBe('step-1');
    });

    it('rejects an unsaved career with 409 and writes nothing', async () => {
      arrangeReadable(false);

      await expect(
        service.submitStageQuiz('user-1', 'pathway-1', 'stage-1', []),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockActivity.recordQuizPassed).not.toHaveBeenCalled();
    });

    it('rejects a stage with no quiz, or from another pathway, with 404', async () => {
      arrangeReadable();
      mockPrisma.stageQuiz.findFirst.mockResolvedValue(null);

      await expect(
        service.submitStageQuiz('user-1', 'pathway-1', 'stage-9', []),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.stageQuiz.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stageId: 'stage-9', stage: { pathwayId: 'pathway-1' } },
        }),
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an unreadable pathway with 404', async () => {
      mockPrisma.pathway.findFirst.mockResolvedValue(null);

      await expect(
        service.submitStageQuiz('user-1', 'pathway-1', 'stage-1', []),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('stores no attempt and awards no XP when the transaction fails', async () => {
      arrangeReadable();
      mockActivity.recordQuizPassed.mockRejectedValue(new Error('ledger down'));
      // A transaction that stores only what the callback finishes
      const committed: unknown[] = [];
      mockPrisma.quizAttempt.create.mockImplementation((args) => {
        committed.push(args);
        return Promise.resolve({ submittedAt });
      });
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const before = committed.length;
        try {
          return await cb(mockPrisma);
        } catch (error) {
          committed.length = before;
          throw error;
        }
      });

      await expect(
        service.submitStageQuiz(
          'user-1',
          'pathway-1',
          'stage-1',
          answersWith([]),
        ),
      ).rejects.toThrow('ledger down');
      expect(committed).toHaveLength(0);
      expect(mockActivity.awardEarnedBadges).not.toHaveBeenCalled();
      expect(mockActivity.getUserStats).not.toHaveBeenCalled();
    });

    it('logs the ids, the score and the label, never the answers', async () => {
      arrangeReadable();
      const log = jest
        .spyOn(
          (service as unknown as { logger: { log: () => void } }).logger,
          'log',
        )
        .mockImplementation(() => undefined);

      await service.submitStageQuiz(
        'user-1',
        'pathway-1',
        'stage-1',
        answersWith([2]),
      );

      expect(log).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          quizId: 'quiz-1',
          correct: 4,
          total: 5,
          passed: true,
        },
        'Quiz submitted',
      );
    });
  });

  describe('getStageQuizResult', () => {
    const stored = (wrongQuestions: number[]) => ({
      answers: answersWith(wrongQuestions),
      submittedAt,
    });

    it('returns the latest attempt with a breakdown and no XP', async () => {
      arrangeReadable(false);
      mockPrisma.quizAttempt.findFirst.mockResolvedValue(stored([2]));

      const result = await service.getStageQuizResult(
        'user-1',
        'pathway-1',
        'stage-1',
      );

      expect(mockPrisma.quizAttempt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', stageQuizId: 'quiz-1' },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result).toMatchObject({
        score: { correct: 4, total: 5 },
        passed: true,
        revisitStepId: 'step-2',
        submittedAt,
      });
      expect(result.breakdown).toHaveLength(5);
      expect(result).not.toHaveProperty('xpAwarded');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('is not found when the user has no attempt', async () => {
      arrangeReadable();
      mockPrisma.quizAttempt.findFirst.mockResolvedValue(null);

      await expect(
        service.getStageQuizResult('user-1', 'pathway-1', 'stage-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is not found for an attempt stored without answers', async () => {
      arrangeReadable();
      mockPrisma.quizAttempt.findFirst.mockResolvedValue({
        answers: [],
        submittedAt,
      });

      await expect(
        service.getStageQuizResult('user-1', 'pathway-1', 'stage-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is not found for a stage with no quiz, without reading attempts', async () => {
      arrangeReadable();
      mockPrisma.stageQuiz.findFirst.mockResolvedValue(null);

      await expect(
        service.getStageQuizResult('user-1', 'pathway-1', 'stage-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.quizAttempt.findFirst).not.toHaveBeenCalled();
    });
  });
});
