import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  FeedbackResolution,
  FeedbackStatus,
} from '../../generated/prisma/client';

export class UpdateFeedbackDto {
  @ApiProperty({ enum: FeedbackStatus, example: 'RESOLVED' })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;

  @ApiPropertyOptional({
    enum: FeedbackResolution,
    nullable: true,
    example: 'FIXED',
    description:
      'Required when status is RESOLVED. Not allowed with any other status, which clears it.',
  })
  @IsOptional()
  @IsEnum(FeedbackResolution)
  resolution?: FeedbackResolution | null;
}
