import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { TargetLevel } from '../../../generated/prisma/client';

export class GetCareersQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by target level',
    enum: TargetLevel,
    example: 'RECENT_GRAD',
  })
  @IsOptional()
  @IsEnum(TargetLevel)
  level?: TargetLevel;

  @ApiPropertyOptional({
    description:
      'Filter by field of interest (using the field slug, e.g., "software-engineering")',
    example: 'software-engineering',
  })
  @IsOptional()
  @IsString()
  interest?: string;
}
