import { ApiProperty } from '@nestjs/swagger';

export class StageQuizScoreDto {
  @ApiProperty({ example: 4 })
  correct: number;

  @ApiProperty({ example: 5 })
  total: number;
}

export class StageQuizBreakdownItemDto {
  @ApiProperty({ format: 'uuid' })
  questionId: string;

  @ApiProperty({ example: 'Which keyword declares a constant?' })
  prompt: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  selectedOptionId: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null when the question was not answered',
  })
  selectedOptionText: string | null;

  @ApiProperty({ format: 'uuid' })
  correctOptionId: string;

  @ApiProperty({ example: 'const' })
  correctOptionText: string;

  @ApiProperty()
  isCorrect: boolean;
}

export class StageQuizResultDto {
  @ApiProperty({ format: 'uuid' })
  quizId: string;

  @ApiProperty({ type: StageQuizScoreDto })
  score: StageQuizScoreDto;

  @ApiProperty({
    description: 'Whether the score reaches the pass mark. A label only.',
  })
  passed: boolean;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The step of the first wrong question that has one, else null',
  })
  revisitStepId: string | null;

  @ApiProperty({
    type: [StageQuizBreakdownItemDto],
    description: 'One item per question, in display order',
  })
  breakdown: StageQuizBreakdownItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  submittedAt: Date;
}

export class StageQuizStreakDto {
  @ApiProperty({ example: 3 })
  current: number;

  @ApiProperty({ example: 7 })
  longest: number;
}

export class SubmitStageQuizResponseDto extends StageQuizResultDto {
  @ApiProperty({
    example: 20,
    description:
      'XP awarded by this submit: 20 on the first submit of this quiz, 0 after that. The score does not change it.',
  })
  xpAwarded: number;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The next step on the pathway, or null when all are done',
  })
  nextStepId: string | null;

  @ApiProperty({ type: StageQuizStreakDto })
  streak: StageQuizStreakDto;
}
