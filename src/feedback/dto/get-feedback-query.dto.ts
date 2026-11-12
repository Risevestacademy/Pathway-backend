import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  FeedbackCategory,
  FeedbackStatus,
  FeedbackTargetType,
} from '../../generated/prisma/client';

export class GetFeedbackQueryDto {
  @ApiPropertyOptional({ enum: FeedbackStatus, example: 'NEW' })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackCategory, example: 'BROKEN_LINK' })
  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @ApiPropertyOptional({ enum: FeedbackTargetType, example: 'PATHWAY_STEP' })
  @IsOptional()
  @IsEnum(FeedbackTargetType)
  targetType?: FeedbackTargetType;

  @ApiPropertyOptional({
    description: 'Only feedback about this career.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  careerId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
