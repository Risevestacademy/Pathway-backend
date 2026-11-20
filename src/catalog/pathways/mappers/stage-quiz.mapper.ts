import type { Prisma } from '../../../generated/prisma/client';
import type { StageQuizDto } from '../dto/stage-quiz.dto';

// correctIndex is deliberately not selected, so it can never reach a response
// built from this select.
export const stageQuizReadSelect = {
  id: true,
  stageId: true,
  questions: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      prompt: true,
      options: {
        orderBy: { order: 'asc' },
        select: { id: true, text: true },
      },
    },
  },
} satisfies Prisma.StageQuizSelect;

export type StageQuizReadRow = Prisma.StageQuizGetPayload<{
  select: typeof stageQuizReadSelect;
}>;

export const toStageQuiz = (quiz: StageQuizReadRow): StageQuizDto => ({
  id: quiz.id,
  stageId: quiz.stageId,
  questions: quiz.questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
    })),
  })),
});
