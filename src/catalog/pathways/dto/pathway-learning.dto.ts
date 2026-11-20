import { ApiProperty } from '@nestjs/swagger';
import { PathwayStepStatus } from '../../../generated/prisma/client';
import { PathwayReadStageProgressDto } from './pathway-read.dto';
import {
  StageQuizStatusNotTaken,
  StageQuizStatusTaken,
} from './stage-quiz-status.dto';

export class PathwayLearningStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Learn TypeScript Basics' })
  title: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ enum: PathwayStepStatus })
  status: PathwayStepStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
}

export class PathwayLearningStageDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Language foundations' })
  title: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({
    type: PathwayReadStageProgressDto,
    description: 'Self-reported step completion within the stage',
  })
  progress: PathwayReadStageProgressDto;

  @ApiProperty({
    oneOf: [
      { $ref: '#/components/schemas/StageQuizStatusNotTaken' },
      { $ref: '#/components/schemas/StageQuizStatusTaken' },
    ],
    nullable: true,
    description: 'Null when the stage has no quiz',
  })
  quiz: StageQuizStatusNotTaken | StageQuizStatusTaken | null;
}
