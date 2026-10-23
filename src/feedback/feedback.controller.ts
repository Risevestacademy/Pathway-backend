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
      'Public and anonymous. The optional contact email is stored but never logged.',
  })
  @ApiResponse({
    status: 201,
    description: 'Feedback recorded',
    type: CreateFeedbackResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Body failed validation, careerId is missing for a section other than GENERAL, or careerId matches no career',
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
