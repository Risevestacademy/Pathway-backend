import { ApiProperty } from '@nestjs/swagger';
import { FeedbackResponseDto } from './feedback-response.dto';

export class FeedbackListResponseDto {
  @ApiProperty({ type: [FeedbackResponseDto] })
  items: FeedbackResponseDto[];

  @ApiProperty({ example: 42, description: 'Total matching feedback entries' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
