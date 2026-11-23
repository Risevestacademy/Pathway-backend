import { ApiProperty } from '@nestjs/swagger';
import type { ChannelPreference } from '../notification-preferences';

export class ChannelPreferenceDto implements ChannelPreference {
  @ApiProperty({ example: true })
  inAppEnabled: boolean;

  @ApiProperty({ example: false })
  emailEnabled: boolean;
}
