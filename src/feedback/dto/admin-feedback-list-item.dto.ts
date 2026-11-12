import { ApiProperty } from '@nestjs/swagger';
import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackResolution,
  FeedbackSection,
  FeedbackStatus,
  FeedbackTargetType,
} from '../../generated/prisma/client';

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

export class AdminFeedbackListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FeedbackCategory, example: 'BROKEN_LINK' })
  category: FeedbackCategory;

  @ApiProperty({ enum: FeedbackSection, example: 'RESOURCES' })
  section: FeedbackSection;

  @ApiProperty({ enum: FeedbackStatus, example: 'NEW' })
  status: FeedbackStatus;

  @ApiProperty({
    enum: FeedbackResolution,
    nullable: true,
    description: 'Set only when the status is RESOLVED',
  })
  resolution: FeedbackResolution | null;

  @ApiProperty({
    example: 'The link on step 3 returns a 404.',
    description: 'The start of the description, up to 120 characters',
  })
  snippet: string;

  @ApiProperty({ type: FeedbackTargetDto })
  target: FeedbackTargetDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'user@example.com',
    description: 'The contact email the reporter left, if any',
  })
  reporterEmail: string | null;

  @ApiProperty({ enum: FeedbackPlatform, nullable: true, example: 'WEB' })
  platform: FeedbackPlatform | null;

  @ApiProperty()
  createdAt: Date;
}
