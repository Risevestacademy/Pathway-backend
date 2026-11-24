import { ApiProperty } from '@nestjs/swagger';

export class NotificationUnreadCountDto {
  @ApiProperty({ example: 3 })
  count: number;
}
