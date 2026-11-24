import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NOTIFICATION_FILTERS,
  NOTIFICATION_PAGE_DEFAULT_LIMIT,
  NOTIFICATION_PAGE_MAX_LIMIT,
  type NotificationFilter,
} from '../notification-inbox';

export const NOTIFICATION_CURSOR_MAX_LENGTH = 128;

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(NOTIFICATION_FILTERS)
  filter: NotificationFilter = 'all';

  @ApiPropertyOptional({
    description: 'The nextCursor of the previous page.',
    maxLength: NOTIFICATION_CURSOR_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_CURSOR_MAX_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: NOTIFICATION_PAGE_MAX_LIMIT,
    default: NOTIFICATION_PAGE_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_PAGE_MAX_LIMIT)
  limit: number = NOTIFICATION_PAGE_DEFAULT_LIMIT;
}
