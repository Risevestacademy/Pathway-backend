import { ApiProperty } from '@nestjs/swagger';
import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSection,
  FeedbackStatus,
} from '../../generated/prisma/client';

export class FeedbackResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FeedbackCategory, example: 'BROKEN_LINK' })
  category: FeedbackCategory;

  @ApiProperty({ enum: FeedbackSection, example: 'RESOURCES' })
  section: FeedbackSection;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  careerId: string | null;

  @ApiProperty({ example: 'The link on step 3 returns a 404.' })
  description: string;

  @ApiProperty({ type: String, nullable: true, example: 'user@example.com' })
  userEmail: string | null;

  @ApiProperty({ enum: FeedbackPlatform, nullable: true, example: 'WEB' })
  platform: FeedbackPlatform | null;

  @ApiProperty({ enum: FeedbackStatus, example: 'NEW' })
  status: FeedbackStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
