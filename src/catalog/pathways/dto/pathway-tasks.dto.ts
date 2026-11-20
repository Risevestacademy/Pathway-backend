import { ApiProperty } from '@nestjs/swagger';
import {
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import {
  PathwayLearningStageDto,
  PathwayLearningStepDto,
} from './pathway-learning.dto';

export class PathwayTaskItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Build a typed API client' })
  title: string;

  @ApiProperty({ example: 'Practise generics on a real request helper' })
  goal: string;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  estimatedWeeks: number | null;

  @ApiProperty({ example: false })
  isCompleted: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;

  @ApiProperty({
    example: 2,
    description: 'Checklist items the caller has ticked',
  })
  checklistChecked: number;

  @ApiProperty({ example: 4 })
  checklistTotal: number;
}

export class PathwayTasksStepDto extends PathwayLearningStepDto {
  @ApiProperty({ type: [PathwayTaskItemDto] })
  tasks: PathwayTaskItemDto[];
}

export class PathwayTasksStageDto extends PathwayLearningStageDto {
  @ApiProperty({ type: [PathwayTasksStepDto] })
  steps: PathwayTasksStepDto[];
}

export class PathwayTasksDto {
  @ApiProperty()
  pathwayId: string;

  @ApiProperty({ type: [PathwayTasksStageDto] })
  stages: PathwayTasksStageDto[];
}

export class PathwayTaskChecklistEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Handle a failed request' })
  text: string;

  @ApiProperty({ example: true })
  isChecked: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkedAt: Date | null;
}

export class PathwayTaskLinkDto {
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

  @ApiProperty({ example: 'https://www.typescriptlang.org/docs/handbook/' })
  url: string;
}

export class PathwayTaskDetailDto extends PathwayTaskItemDto {
  @ApiProperty({ description: 'The step the task belongs to' })
  stepId: string;

  @ApiProperty({ type: [String], example: ['A request helper with types'] })
  whatToMake: string[];

  @ApiProperty({ type: [String], example: ['Start with a GET request'] })
  hints: string[];

  @ApiProperty({
    type: [PathwayTaskChecklistEntryDto],
    description: "In order, with the caller's ticks",
  })
  checklist: PathwayTaskChecklistEntryDto[];

  @ApiProperty({
    type: [PathwayTaskLinkDto],
    description: 'ACTIVE resources linked to the task, in order',
  })
  helpfulLinks: PathwayTaskLinkDto[];
}
