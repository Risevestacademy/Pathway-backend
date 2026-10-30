import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewDecision } from '../../../generated/prisma/client';

export const REVIEW_NOTE_MAX_LENGTH = 2000;

export class ReviewRevisionDto {
  @ApiProperty({ enum: ReviewDecision, example: 'APPROVED' })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiPropertyOptional({
    maxLength: REVIEW_NOTE_MAX_LENGTH,
    example: 'The salary source is out of date.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(REVIEW_NOTE_MAX_LENGTH)
  note?: string;
}
