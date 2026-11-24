import { ApiProperty } from '@nestjs/swagger';
import { NotificationItemDto } from './notification-item.dto';

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationItemDto] })
  items: NotificationItemDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'MjAyNi0xMS0yNFQwOToxNTozMC4xMjNaXzBiN2E2ZjNlLTJjMWQtNGU1Zi04YTliLTFjMmQzZTRmNWE2Yg',
    description:
      'Pass as `cursor` to read the next page; null on the last page.',
  })
  nextCursor: string | null;
}
