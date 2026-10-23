import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  STEP_COMPLETION_STATUSES,
  type StepCompletionStatus,
} from '../../pathways';

export class SetStepStatusDto {
  @ApiProperty({
    enum: STEP_COMPLETION_STATUSES,
    description: 'COMPLETED marks the step done; NOT_STARTED clears it.',
  })
  @IsIn(STEP_COMPLETION_STATUSES)
  status: StepCompletionStatus;
}
