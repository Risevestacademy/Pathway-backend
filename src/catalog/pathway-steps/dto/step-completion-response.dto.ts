import { ApiProperty } from '@nestjs/swagger';
import {
  PathwayReadProgressDto,
  PathwayReadStageProgressDto,
} from '../../pathways/dto/pathway-read.dto';
import {
  STEP_COMPLETION_STATUSES,
  type StepCompletionStatus,
} from './step-status-response.dto';

export class StepCompletionStageProgressDto extends PathwayReadStageProgressDto {
  @ApiProperty()
  stageId: string;
}

export class StepCompletionResponseDto {
  @ApiProperty()
  stepId: string;

  @ApiProperty({ enum: STEP_COMPLETION_STATUSES })
  status: StepCompletionStatus;

  @ApiProperty({ type: Date, nullable: true })
  completedAt: Date | null;

  @ApiProperty({ type: PathwayReadProgressDto })
  progress: PathwayReadProgressDto;

  @ApiProperty({ type: StepCompletionStageProgressDto, nullable: true })
  stageProgress: StepCompletionStageProgressDto | null;

  @ApiProperty({ type: String, nullable: true })
  nextStepId: string | null;

  @ApiProperty({
    description: 'XP this request awarded. 0 on a repeat or an undo.',
  })
  xpAwarded: number;
}
