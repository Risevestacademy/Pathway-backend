import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewDecision } from '../../generated/prisma/client';

/**
 * POST /admin/sessions/:sessionId/review
 *
 * The note is NEVER logged or sent to analytics. It lives only on the
 * Review row. Capped at 2000 characters (same as the old ReviewRevisionDto;
 * check src/catalog/content-revisions/dto/review-revision.dto.ts to confirm
 * before merge — if it used a different cap, use that cap here).
 */
export class ReviewSessionDto {
  @ApiProperty({ enum: ReviewDecision, example: ReviewDecision.APPROVED })
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: 2000,
    example: 'Looks good, but the salary range needs a source.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
