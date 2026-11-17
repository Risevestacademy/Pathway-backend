import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetItemCompletionDto {
  @ApiProperty({
    description: 'true marks the item complete; false undoes the mark.',
  })
  @IsBoolean()
  completed: boolean;
}
