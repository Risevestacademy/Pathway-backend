import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FeedbackStatus } from '../../generated/prisma/client';

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus, example: 'UNDER_REVIEW' })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}
