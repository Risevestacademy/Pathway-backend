import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetChecklistItemDto {
  @ApiProperty({ description: 'true ticks the item; false unticks it.' })
  @IsBoolean()
  checked: boolean;
}
