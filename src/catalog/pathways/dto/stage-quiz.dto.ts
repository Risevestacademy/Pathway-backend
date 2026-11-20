import { ApiProperty } from '@nestjs/swagger';

export class StageQuizOptionDto {
  @ApiProperty({ format: 'uuid', description: 'Send this id as the answer' })
  id: string;

  @ApiProperty({ example: 'A closure' })
  text: string;
}

export class StageQuizQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Which keyword declares a constant?' })
  prompt: string;

  @ApiProperty({
    type: [StageQuizOptionDto],
    description: 'In display order',
  })
  options: StageQuizOptionDto[];
}

// The correct option is never part of this response
export class StageQuizDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  stageId: string;

  @ApiProperty({
    type: [StageQuizQuestionDto],
    description: 'In display order',
  })
  questions: StageQuizQuestionDto[];
}
