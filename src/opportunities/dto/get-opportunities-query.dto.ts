import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OpportunityType } from '../../generated/prisma/client';

export const OPPORTUNITIES_DEFAULT_LIMIT = 20;
export const OPPORTUNITIES_MAX_LIMIT = 50;
export const OPPORTUNITIES_SEARCH_MAX_LENGTH = 100;

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? value : Number(value);

export class GetOpportunitiesQueryDto {
  @ApiPropertyOptional({ enum: OpportunityType, example: 'INTERNSHIP' })
  @IsOptional()
  @IsEnum(OpportunityType)
  type?: OpportunityType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only listings linked to this career.',
  })
  @IsOptional()
  @IsUUID()
  careerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Leaves this listing out. Used with careerId for "See similar roles".',
  })
  @IsOptional()
  @IsUUID()
  excludeId?: string;

  @ApiPropertyOptional({
    description: 'Matches the title or organisation, ignoring case.',
    maxLength: OPPORTUNITIES_SEARCH_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(OPPORTUNITIES_SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000, default: 1 })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: OPPORTUNITIES_MAX_LIMIT,
    default: OPPORTUNITIES_DEFAULT_LIMIT,
    description: `Values above ${OPPORTUNITIES_MAX_LIMIT} are capped to ${OPPORTUNITIES_MAX_LIMIT}.`,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const limit = toNumber({ value });
    return typeof limit === 'number' && limit > OPPORTUNITIES_MAX_LIMIT
      ? OPPORTUNITIES_MAX_LIMIT
      : limit;
  })
  @IsInt()
  @Min(1)
  limit: number = OPPORTUNITIES_DEFAULT_LIMIT;
}
