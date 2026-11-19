import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GetPathwayResourceQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The step the resource was opened from; adds its usage note and next task',
  })
  @IsOptional()
  @IsUUID()
  stepId?: string;
}
