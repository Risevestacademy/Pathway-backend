import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../common';
import { NotificationCategory } from '../generated/prisma/client';
import { ChannelPreferenceDto } from './dto/channel-preference.dto';
import { NotificationPreferencesResponseDto } from './dto/notification-preferences-response.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/notification-preferences')
@UseGuards(JwtAuthGuard)
export class MeNotificationPreferencesController {
  constructor(
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @ApiOperation({
    summary: "Get the signed-in user's notification preferences",
    description:
      'Every category with both channels. A category the user has never changed returns its defaults.',
  })
  @ApiResponse({ status: 200, type: NotificationPreferencesResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get()
  async getMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.notificationPreferencesService.getForUser(user.id);
  }

  @ApiOperation({
    summary: "Update one category of the signed-in user's preferences",
    description: 'An omitted channel is unchanged.',
  })
  @ApiParam({ name: 'category', enum: NotificationCategory })
  @ApiResponse({ status: 200, type: ChannelPreferenceDto })
  @ApiResponse({
    status: 400,
    description: 'The category is unknown, or the body failed validation',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Patch(':category')
  async updateMyPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category', new ParseEnumPipe(NotificationCategory))
    category: NotificationCategory,
    @Body() dto: UpdateNotificationPreferenceDto,
  ): Promise<ChannelPreferenceDto> {
    return this.notificationPreferencesService.updateForUser(
      user.id,
      category,
      dto,
    );
  }
}
