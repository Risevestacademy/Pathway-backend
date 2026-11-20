import { ApiProperty } from '@nestjs/swagger';
import { PathwayLearningStageDto } from './pathway-learning.dto';

export class PathwayProgressSummaryDto {
  @ApiProperty({ example: 1 })
  completed: number;

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 33 })
  percentage: number;

  @ApiProperty({
    example: true,
    description: 'Progress is self-reported, never verified',
  })
  selfReported: true;
}

export class PathwayProgressStageRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Web foundations' })
  title: string;

  @ApiProperty({ example: 1 })
  order: number;
}

export class PathwayProgressStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Structure and style pages with HTML and CSS' })
  title: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ type: PathwayProgressStageRefDto })
  stage: PathwayProgressStageRefDto;
}

export class PathwayCompletedStepDto extends PathwayProgressStepDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
}

export class PathwayProgressDto {
  @ApiProperty()
  pathwayId: string;

  @ApiProperty({ type: PathwayProgressSummaryDto })
  progress: PathwayProgressSummaryDto;

  @ApiProperty({
    type: [PathwayLearningStageDto],
    description: 'Every stage with its progress and quiz status (best score)',
  })
  stages: PathwayLearningStageDto[];

  @ApiProperty({
    type: [PathwayCompletedStepDto],
    description: 'Completed steps, most recently completed first',
  })
  completedSteps: PathwayCompletedStepDto[];

  @ApiProperty({
    type: PathwayProgressStepDto,
    nullable: true,
    description: 'Null when every step is complete',
  })
  nextStep: PathwayProgressStepDto | null;
}
