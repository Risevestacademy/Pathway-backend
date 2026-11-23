import { ApiProperty } from '@nestjs/swagger';
import type { NotificationPreferenceMap } from '../notification-preferences';
import { ChannelPreferenceDto } from './channel-preference.dto';

export class NotificationPreferencesResponseDto implements NotificationPreferenceMap {
  @ApiProperty({ type: ChannelPreferenceDto })
  ROADMAP_UPDATES: ChannelPreferenceDto;

  @ApiProperty({ type: ChannelPreferenceDto })
  NEW_OPENINGS: ChannelPreferenceDto;

  @ApiProperty({ type: ChannelPreferenceDto })
  FEEDBACK_REPLIES: ChannelPreferenceDto;

  @ApiProperty({ type: ChannelPreferenceDto })
  RESOURCE_LINK_PROBLEMS: ChannelPreferenceDto;

  @ApiProperty({ type: ChannelPreferenceDto })
  LEARNING_REMINDERS: ChannelPreferenceDto;

  @ApiProperty({ type: ChannelPreferenceDto })
  STREAK_NUDGES: ChannelPreferenceDto;
}
