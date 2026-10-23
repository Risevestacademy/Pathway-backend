import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../common';
import { Role } from '../generated/prisma/client';
import { FeedbackService } from './feedback.service';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { FeedbackListResponseDto } from './dto/feedback-list-response.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EDITOR, Role.ADMIN)
export class AdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @ApiOperation({
    summary: 'List submitted feedback',
    description:
      'Newest first. Filter by status or career, paginated with page and limit.',
  })
  @ApiResponse({ status: 200, type: FeedbackListResponseDto })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is not an editor or admin',
  })
  @Get('feedback')
  async getFeedback(
    @Query() query: GetFeedbackQueryDto,
  ): Promise<FeedbackListResponseDto> {
    return this.feedbackService.getFeedback(query);
  }

  @ApiOperation({ summary: 'Update the review status of a feedback entry' })
  @ApiResponse({ status: 200, type: FeedbackResponseDto })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID or status is not a FeedbackStatus',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is not an editor or admin',
  })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  @Patch('feedback/:id/status')
  async updateFeedbackStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ): Promise<FeedbackResponseDto> {
    return this.feedbackService.updateFeedbackStatus(id, dto);
  }
}
