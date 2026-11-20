import { ApiProperty } from '@nestjs/swagger';
import {
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import {
  PathwayLearningStageDto,
  PathwayLearningStepDto,
} from './pathway-learning.dto';

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

export class PathwayResourcesStepDto extends PathwayLearningStepDto {
  @ApiProperty({
    type: [PathwayResourceItemDto],
    description: 'ACTIVE resources only',
  })
  resources: PathwayResourceItemDto[];
}

export class PathwayResourcesStageDto extends PathwayLearningStageDto {
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
