import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetActivePathwayDto {
  @ApiProperty({ description: 'UUID of the career to make active' })
  @IsUUID()
  careerId: string;
}
