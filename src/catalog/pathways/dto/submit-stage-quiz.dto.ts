import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class QuizAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The id of the chosen option, from the quiz response',
  })
  @IsUUID()
  optionId: string;
}

export class SubmitStageQuizDto {
  @ApiProperty({
    type: [QuizAnswerDto],
    description:
      'One answer per question. A question left out counts as wrong. If a question is answered twice, the first answer counts.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers: QuizAnswerDto[];
}
