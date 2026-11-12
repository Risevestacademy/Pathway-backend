import { ApiProperty } from '@nestjs/swagger';
import {
  FeedbackResolution,
  FeedbackTargetType,
} from '../../generated/prisma/client';
import { FeedbackResponseDto } from './feedback-response.dto';

export class FeedbackTargetDto {
  @ApiProperty({ enum: FeedbackTargetType, example: 'PATHWAY_STEP' })
  type: FeedbackTargetType;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Null for OTHER',
  })
  id: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Step 3: SQL basics',
    description:
      'The title of the item. Null for OTHER, or when the item no longer exists (reports keep no foreign key to their target).',
  })
  label: string | null;
}

// Extends the existing item so every field clients already read stays, and
// adds the two the Reports table needs.
export class AdminFeedbackListItemDto extends FeedbackResponseDto {
  @ApiProperty({
    enum: FeedbackResolution,
    nullable: true,
    description: 'Set only when the status is RESOLVED',
  })
  resolution: FeedbackResolution | null;

  @ApiProperty({
    example: 'The link on step 3 returns a 404.',
    description:
      'The start of the description, up to 120 characters, for the table',
  })
  snippet: string;

  @ApiProperty({ type: FeedbackTargetDto })
  target: FeedbackTargetDto;
}
