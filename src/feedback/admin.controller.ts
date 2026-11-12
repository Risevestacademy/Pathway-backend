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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, MinRole, RolesGuard } from '../common';
import { Role } from '../generated/prisma/client';
import { FeedbackService } from './feedback.service';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { FeedbackListResponseDto } from './dto/feedback-list-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @ApiOperation({
    summary: 'List submitted feedback and reports',
    description:
      'Minimum role: REVIEWER. Newest first, paginated with page and limit. Filter by status, category, targetType or career. Each item has what the Reports table needs: a description snippet, the target with its title, the reporter email (userEmail) and the date. The full description stays in each item and the internal notes are never part of the list.',
  })
  @ApiResponse({ status: 200, type: FeedbackListResponseDto })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below the REVIEWER role',
  })
  @MinRole(Role.REVIEWER)
  @Get('feedback')
  async getFeedback(
    @Query() query: GetFeedbackQueryDto,
  ): Promise<FeedbackListResponseDto> {
    return this.feedbackService.getFeedback(query);
  }

  @ApiOperation({
    summary: 'Update the review status of a feedback entry',
    description: 'Minimum role: REVIEWER.',
  })
  @ApiResponse({ status: 200, type: FeedbackResponseDto })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID or status is not a FeedbackStatus',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below the REVIEWER role',
  })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  @MinRole(Role.REVIEWER)
  @Patch('feedback/:id/status')
  async updateFeedbackStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ): Promise<FeedbackResponseDto> {
    return this.feedbackService.updateFeedbackStatus(id, dto);
  }
}
