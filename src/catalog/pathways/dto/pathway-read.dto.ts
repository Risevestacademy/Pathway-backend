import { ApiProperty } from '@nestjs/swagger';
import {
  PathwayStepStatus,
  ResourceType,
  ResourceCostStatus,
} from '../../../generated/prisma/client';
import {
  StageQuizStatusNotTaken,
  StageQuizStatusTaken,
} from './stage-quiz-status.dto';

export class PathwayReadProgressDto {
  @ApiProperty()
  completed: number;
  @ApiProperty()
  total: number;
  @ApiProperty()
  percentage: number;
  @ApiProperty({ type: String, nullable: true })
  nextStepId: string | null;
  @ApiProperty({ example: true })
  selfReported: true;
}

export class PathwayReadStageProgressDto {
  @ApiProperty()
  completed: number;
  @ApiProperty()
  total: number;
  @ApiProperty()
  percentage: number;
}

// ─── Resources & Tasks (only on the next step and the start step) ───
export class StepResourceDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  url: string;
  @ApiProperty({ enum: ResourceType })
  type: ResourceType;
  @ApiProperty({ enum: ResourceCostStatus })
  costStatus: ResourceCostStatus;
  @ApiProperty({ type: Number, nullable: true })
  estimatedWeeks: number | null;
  @ApiProperty({ type: String, nullable: true })
  provider: string | null;
}

export class StepTaskDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  goal: string;
  @ApiProperty({ type: Number, nullable: true })
  estimatedWeeks: number | null;
  @ApiProperty({ type: [String] })
  whatToMake: string[];
  @ApiProperty({ type: [String] })
  hints: string[];
  @ApiProperty({ type: [String] })
  checklist: string[];
}

export class PathwayReadStepDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  order: number;
  @ApiProperty({ enum: PathwayStepStatus, nullable: true })
  status: PathwayStepStatus | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ type: [String] })
  skills: string[];
  @ApiProperty({ type: String, nullable: true })
  expectedActivity: string | null;
  @ApiProperty({ type: String, nullable: true })
  careerReadiness: string | null;

  // Populated only for the next step and the start step; [] otherwise.
  @ApiProperty({ type: [StepResourceDto] })
  resources: StepResourceDto[];

  @ApiProperty({ type: [StepTaskDto] })
  tasks: StepTaskDto[];
}

export class PathwayReadStageDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  order: number;
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ type: PathwayReadStageProgressDto, nullable: true })
  progress: PathwayReadStageProgressDto | null;
  @ApiProperty({
    oneOf: [
      { $ref: '#/components/schemas/StageQuizStatusNotTaken' },
      { $ref: '#/components/schemas/StageQuizStatusTaken' },
    ],
    nullable: true,
  })
  quiz: StageQuizStatusNotTaken | StageQuizStatusTaken | null;
  @ApiProperty({ type: [PathwayReadStepDto] })
  steps: PathwayReadStepDto[];
}

export class PathwayReadCareerDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ example: false })
  retired: boolean;
  @ApiProperty()
  stageCount: number;
  @ApiProperty()
  stepCount: number;
  @ApiProperty()
  resourceCount: number;
}

export class PathwayReadDto {
  @ApiProperty()
  id: string;
  @ApiProperty({ type: PathwayReadCareerDto })
  career: PathwayReadCareerDto;
  @ApiProperty({ type: PathwayReadProgressDto, nullable: true })
  progress: PathwayReadProgressDto | null;
  @ApiProperty({ type: [PathwayReadStageDto] })
  stages: PathwayReadStageDto[];
}
