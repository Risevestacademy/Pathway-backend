import { ApiProperty } from '@nestjs/swagger';
import { AdminFeedbackListItemDto } from './admin-feedback-list-item.dto';

export class FeedbackListResponseDto {
  @ApiProperty({ type: [AdminFeedbackListItemDto] })
  items: AdminFeedbackListItemDto[];

  @ApiProperty({ example: 42, description: 'Total matching feedback entries' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
