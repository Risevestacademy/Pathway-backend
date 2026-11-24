import { ApiProperty } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationTargetType,
  NotificationType,
} from '../../generated/prisma/client';

export class NotificationItemDto {
  @ApiProperty({ example: '0b7a6f3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b' })
  id: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.FEEDBACK_REPLIED,
  })
  type: NotificationType;

  @ApiProperty({
    enum: NotificationCategory,
    example: NotificationCategory.FEEDBACK_REPLIES,
  })
  category: NotificationCategory;

  @ApiProperty({ example: 'We replied to your feedback' })
  title: string;

  @ApiProperty({
    example:
      'Our team replied to feedback you sent. Open it to read the reply.',
  })
  body: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ type: Date, nullable: true, example: null })
  readAt: Date | null;

  @ApiProperty({
    enum: NotificationTargetType,
    nullable: true,
    example: NotificationTargetType.FEEDBACK,
  })
  targetType: NotificationTargetType | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '5d2c8a41-7e3b-4f6a-9c0d-2b1e4f7a8c93',
  })
  targetId: string | null;

  @ApiProperty({ example: '2026-11-24T09:15:30.123Z' })
  createdAt: Date;
}
