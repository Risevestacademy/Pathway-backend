import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
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
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { MarkAllNotificationsReadDto } from './dto/mark-all-notifications-read.dto';
import { NotificationPageDto } from './dto/notification-page.dto';
import { NotificationUnreadCountDto } from './dto/notification-unread-count.dto';
import { UserNotificationsService } from './user-notifications.service';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class MeNotificationsController {
  constructor(private readonly userNotifications: UserNotificationsService) {}

  @ApiOperation({
    summary: "List the signed-in user's notifications",
    description:
      'Newest first. Pass the returned nextCursor as cursor to read the next page.',
  })
  @ApiResponse({ status: 200, type: NotificationPageDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid filter or limit (VALIDATION_ERROR), or a malformed cursor (INVALID_CURSOR)',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get()
  listMyNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    return this.userNotifications.list(user.id, query);
  }

  @ApiOperation({ summary: "Count the signed-in user's unread notifications" })
  @ApiResponse({ status: 200, type: NotificationUnreadCountDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get('unread-count')
  async getUnreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationUnreadCountDto> {
    return { count: await this.userNotifications.unreadCount(user.id) };
  }

  @ApiOperation({ summary: "Mark all the signed-in user's notifications read" })
  @ApiResponse({ status: 200, type: MarkAllNotificationsReadDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Patch('read-all')
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkAllNotificationsReadDto> {
    return this.userNotifications.markAllRead(user.id);
  }

  @ApiOperation({
    summary: 'Mark one notification read',
    description: 'Marking a notification that is already read succeeds.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Notification marked read.' })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description: 'No notification with this id belongs to the caller',
  })
  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.userNotifications.markRead(user.id, id);
  }
}
