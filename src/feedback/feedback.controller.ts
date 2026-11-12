import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeedbackThrottle } from '../common/throttler';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';

@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @ApiOperation({
    summary: 'Submit feedback or report an issue',
    description:
      'Public and anonymous. Say what the report is about with targetType and targetId, for example PATHWAY_STEP with the step id, or CERTIFICATION for a certification. The item must exist and be visible. OTHER needs no targetId. Older clients can still send only careerId, which is read as a CAREER target. The optional contact email is stored but never logged.',
  })
  @ApiResponse({
    status: 201,
    description: 'Feedback recorded',
    type: CreateFeedbackResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Body failed validation, targetId is missing for a targetType other than OTHER, careerId is missing for a section other than GENERAL (when no targetType is sent), or careerId matches no career',
  })
  @ApiResponse({
    status: 404,
    description: 'The target does not exist or is not visible',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @FeedbackThrottle()
  @Post()
  async submitFeedback(
    @Body() dto: CreateFeedbackDto,
  ): Promise<CreateFeedbackResponseDto> {
    return this.feedbackService.submitFeedback(dto);
  }
}
