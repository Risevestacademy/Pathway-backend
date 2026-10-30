import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CareerStatus } from '../../../generated/prisma/client';

export const ADMIN_CAREERS_MAX_LIMIT = 100;
export const ADMIN_CAREERS_SEARCH_MAX_LENGTH = 100;

export class GetAdminCareersQueryDto {
  @ApiPropertyOptional({ enum: CareerStatus, example: 'DRAFT' })
  @IsOptional()
  @IsEnum(CareerStatus)
  status?: CareerStatus;

  @ApiPropertyOptional({
    description: 'Matches the title or slug, ignoring case.',
    maxLength: ADMIN_CAREERS_SEARCH_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(ADMIN_CAREERS_SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ADMIN_CAREERS_MAX_LIMIT,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_CAREERS_MAX_LIMIT)
  limit: number = 20;
}
