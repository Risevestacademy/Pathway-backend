import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ActivityService } from '../../activity';
import { PrismaService } from '../../prisma';
import type {
  StageQuizResultDto,
  SubmitStageQuizResponseDto,
} from './dto/stage-quiz-result.dto';
import {
  gradeStageQuiz,
  parseStoredAnswers,
  stageQuizGradingSelect,
  toStageQuizResult,
  type StageQuizGradingRow,
} from './mappers/stage-quiz-result.mapper';
import { assertPathwayReadable } from './pathway-access';
import { computeNextStep } from './progress';
import type { QuizAnswer } from './quiz-grading';

@Injectable()
export class StageQuizService {
  private readonly logger = new Logger(StageQuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async submitStageQuiz(
    userId: string,
    pathwayId: string,
    stageId: string,
    answers: readonly QuizAnswer[],
  ): Promise<SubmitStageQuizResponseDto> {
    const pathway = await assertPathwayReadable(this.prisma, pathwayId, userId);
    const quiz = await this.findQuiz(pathwayId, stageId);

    if (!pathway.saved) {
      this.logger.warn(
        { userId, quizId: quiz.id, reason: 'CAREER_NOT_SAVED' },
        'Quiz submit rejected',
      );
      throw new ConflictException(
        'Save this career before tracking its progress',
      );
    }

    const grade = gradeStageQuiz(quiz, answers);

    const { submittedAt, xpAwarded } = await this.prisma.$transaction(
      async (tx) => {
        const attempt = await tx.quizAttempt.create({
          data: {
            userId,
            stageQuizId: quiz.id,
            correct: grade.correct,
            total: grade.total,
            answers: answers.map(({ questionId, optionId }) => ({
              questionId,
              optionId,
            })),
          },
          select: { submittedAt: true },
        });

        const xp = await this.activity.recordQuizPassed(userId, quiz.id, tx);
        if (xp > 0) {
          await this.activity.awardEarnedBadges(userId, tx);
        }

        return { submittedAt: attempt.submittedAt, xpAwarded: xp };
      },
    );

    this.logger.log(
      {
        userId,
        quizId: quiz.id,
        correct: grade.correct,
        total: grade.total,
        passed: grade.passed,
      },
      'Quiz submitted',
    );

    const [nextStepId, stats] = await Promise.all([
      this.findNextStepId(userId, pathwayId, pathway.startStepId),
      this.activity.getUserStats(userId),
    ]);

    return {
      ...toStageQuizResult(quiz, grade, submittedAt),
      xpAwarded,
      nextStepId,
      streak: stats.streak,
    };
  }

  async getStageQuizResult(
    userId: string,
    pathwayId: string,
    stageId: string,
  ): Promise<StageQuizResultDto> {
    await assertPathwayReadable(this.prisma, pathwayId, userId);
    const quiz = await this.findQuiz(pathwayId, stageId);

    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { userId, stageQuizId: quiz.id },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: { answers: true, submittedAt: true },
    });

    const answers = attempt ? parseStoredAnswers(attempt.answers) : [];
    if (!attempt || answers.length === 0) {
      throw new NotFoundException('No result for this quiz yet');
    }

    return toStageQuizResult(
      quiz,
      gradeStageQuiz(quiz, answers),
      attempt.submittedAt,
    );
  }

  private async findQuiz(
    pathwayId: string,
    stageId: string,
  ): Promise<StageQuizGradingRow> {
    const quiz = await this.prisma.stageQuiz.findFirst({
      where: { stageId, stage: { pathwayId } },
      select: stageQuizGradingSelect,
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    return quiz;
  }

  private async findNextStepId(
    userId: string,
    pathwayId: string,
    startStepId: string | null,
  ): Promise<string | null> {
    const [stages, marks] = await Promise.all([
      this.prisma.pathwayStage.findMany({
        where: { pathwayId },
        select: {
          id: true,
          order: true,
          steps: { select: { id: true, order: true } },
        },
      }),
      this.prisma.userPathwayStep.findMany({
        where: { userId, pathwayStep: { pathwayId } },
        select: { pathwayStepId: true, status: true },
      }),
    ]);

    return computeNextStep(stages, marks, startStepId);
  }
}
