import { ApiProperty } from '@nestjs/swagger';
import { PathwayStepStatus } from '../../../generated/prisma/client';
import { ActivePathwayProgressDto } from './active-pathway-response.dto';

export const STEP_COMPLETION_STATUSES = [
  PathwayStepStatus.COMPLETED,
  PathwayStepStatus.NOT_STARTED,
] as const;

export type StepCompletionStatus = (typeof STEP_COMPLETION_STATUSES)[number];

export class StepStatusResponseDto {
  @ApiProperty() stepId: string;

  @ApiProperty({ enum: STEP_COMPLETION_STATUSES })
  status: StepCompletionStatus;

  @ApiProperty({
    type: ActivePathwayProgressDto,
    description: "Updated progress for the step's pathway.",
  })
  progress: ActivePathwayProgressDto;
}
