import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../common';
import { Role } from '../generated/prisma/client';
import { FeedbackService } from './feedback.service';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { FeedbackListResponseDto } from './dto/feedback-list-response.dto';
import { AdminFeedbackDetailDto } from './dto/admin-feedback-detail.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { CreateFeedbackNoteDto } from './dto/create-feedback-note.dto';
import { FeedbackNoteDto } from './dto/feedback-note.dto';

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
    summary: 'Get one feedback entry with its internal notes',
    description:
      'Minimum role: REVIEWER. The only response that carries notes. Notes are internal and are never part of any public response.',
  })
  @ApiResponse({ status: 200, type: AdminFeedbackDetailDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below the REVIEWER role',
  })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  @MinRole(Role.REVIEWER)
  @Get('feedback/:id')
  async getFeedbackDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminFeedbackDetailDto> {
    return this.feedbackService.getFeedbackDetail(id);
  }

  @ApiOperation({
    summary: 'Set the status and resolution of a feedback entry',
    description:
      'Minimum role: REVIEWER. Status and resolution change together. RESOLVED needs a resolution (FIXED or NOT_AN_ISSUE). Any other status clears it, and sending one with another status is rejected. Returns the admin detail with notes.',
  })
  @ApiResponse({ status: 200, type: AdminFeedbackDetailDto })
  @ApiResponse({
    status: 400,
    description:
      'id is not a UUID, a value is invalid, RESOLUTION_REQUIRED or RESOLUTION_NOT_ALLOWED',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below the REVIEWER role',
  })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  @MinRole(Role.REVIEWER)
  @Patch('feedback/:id')
  async updateFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminFeedbackDetailDto> {
    return this.feedbackService.triageFeedback(id, user.id, dto);
  }

  @ApiOperation({
    summary: 'Add an internal note to a feedback entry',
    description:
      'Minimum role: REVIEWER. Notes are internal: they appear only in admin responses and never in a public one.',
  })
  @ApiResponse({ status: 201, type: FeedbackNoteDto })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID or body is empty or longer than 2000',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below the REVIEWER role',
  })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  @MinRole(Role.REVIEWER)
  @Post('feedback/:id/notes')
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFeedbackNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeedbackNoteDto> {
    return this.feedbackService.addNote(id, user.id, dto.body);
  }

  @ApiOperation({
    summary: 'Update the review status of a feedback entry',
    description:
      'Deprecated: use PATCH /admin/feedback/{id}, which sets the status and resolution together. Minimum role: REVIEWER.',
    deprecated: true,
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
