import { ApiProperty } from '@nestjs/swagger';
import {
  FeedbackCategory,
  FeedbackSection,
  FeedbackStatus,
  FeedbackTargetType,
} from '../../generated/prisma/client';

export class PublicFeedbackDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FeedbackCategory, example: 'BROKEN_LINK' })
  category: FeedbackCategory;

  @ApiProperty({ enum: FeedbackSection, example: 'RESOURCES' })
  section: FeedbackSection;

  @ApiProperty({ enum: FeedbackTargetType, example: 'PATHWAY_STEP' })
  targetType: FeedbackTargetType;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  targetId: string | null;

  @ApiProperty({ example: 'The link on step 3 returns a 404.' })
  description: string;

  @ApiProperty({ enum: FeedbackStatus, example: 'NEW' })
  status: FeedbackStatus;

  @ApiProperty()
  createdAt: Date;
}
