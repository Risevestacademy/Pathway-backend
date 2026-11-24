import { ApiProperty } from '@nestjs/swagger';

export class MarkAllNotificationsReadDto {
  @ApiProperty({ example: 0, description: 'Always 0 after marking all read.' })
  unreadCount: number;
}
