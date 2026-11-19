import { ApiProperty } from '@nestjs/swagger';
import {
  PathwayStepStatus,
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import { PathwayReadStageProgressDto } from './pathway-read.dto';
import {
  StageQuizStatusNotTaken,
  StageQuizStatusTaken,
} from './stage-quiz-status.dto';

export class PathwayResourceItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'The TypeScript Handbook' })
  title: string;

  @ApiProperty({ example: 'Microsoft' })
  provider: string;

  @ApiProperty({ enum: ResourceType })
  type: ResourceType;

  @ApiProperty({ enum: ResourceCostStatus })
  costStatus: ResourceCostStatus;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  estimatedWeeks: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the link was last checked',
  })
  lastCheckedDate: Date;

  @ApiProperty({ example: false })
  isCompleted: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
}

export class PathwayResourcesStepDto {
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

  @ApiProperty({
    type: [PathwayResourceItemDto],
    description: 'ACTIVE resources only',
  })
  resources: PathwayResourceItemDto[];
}

export class PathwayResourcesStageDto {
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

  @ApiProperty({ type: [PathwayResourcesStepDto] })
  steps: PathwayResourcesStepDto[];
}

export class PathwayResourcesDto {
  @ApiProperty()
  pathwayId: string;

  @ApiProperty({ type: [PathwayResourcesStageDto] })
  stages: PathwayResourcesStageDto[];

  @ApiProperty({
    type: [PathwayResourceItemDto],
    description: "The career's PAID courses that no step in this pathway uses",
  })
  optionalPaidCourses: PathwayResourceItemDto[];
}

export class PathwayResourceNextTaskDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Build a typed API client' })
  title: string;

  @ApiProperty({ example: 'Practise generics on a real request helper' })
  goal: string;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  estimatedWeeks: number | null;
}

export class PathwayResourceDetailDto extends PathwayResourceItemDto {
  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: [String], example: ['Write type-safe functions'] })
  outcomes: string[];

  @ApiProperty({ example: 'https://www.typescriptlang.org/docs/handbook/' })
  url: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'How to use this resource in the requested step',
  })
  usageNote: string | null;

  @ApiProperty({
    type: PathwayResourceNextTaskDto,
    nullable: true,
    description:
      "The first task in the requested step the user hasn't completed",
  })
  nextTask: PathwayResourceNextTaskDto | null;
}
