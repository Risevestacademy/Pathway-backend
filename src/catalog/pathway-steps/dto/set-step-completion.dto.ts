import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetStepCompletionDto {
  @ApiProperty({
    description: 'true marks the step complete; false undoes the mark.',
  })
  @IsBoolean()
  completed: boolean;
}
