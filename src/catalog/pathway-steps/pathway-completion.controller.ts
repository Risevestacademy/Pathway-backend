import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
} from '../../common';
import { PathwayStepsService } from './pathway-steps.service';
import { SetStepCompletionDto } from './dto/set-step-completion.dto';
import { StepCompletionResponseDto } from './dto/step-completion-response.dto';

@ApiTags('Pathways')
@Controller('pathways')
@UseGuards(JwtAuthGuard)
export class PathwayCompletionController {
  constructor(private readonly pathwayStepsService: PathwayStepsService) {}

  @ApiOperation({
    summary: 'Mark or unmark a pathway step as complete',
    description:
      'Idempotent. Completing awards step XP and any badges it earns, once per step. Undoing keeps XP and badges.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'stepId', description: 'Pathway step UUID' })
  @ApiResponse({ status: 200, type: StepCompletionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'pathwayId or stepId is not a valid UUID, or the body is invalid.',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid.' })
  @ApiResponse({
    status: 404,
    description:
      "The step isn't in this pathway, or the pathway's career is neither PUBLISHED nor a RETIRED career the user saved.",
  })
  @ApiResponse({
    status: 409,
    description: "The user hasn't saved this pathway's career.",
  })
  @Put(':pathwayId/steps/:stepId/completion')
  async setStepCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: SetStepCompletionDto,
  ): Promise<StepCompletionResponseDto> {
    return this.pathwayStepsService.setStepCompletion(
      user.id,
      pathwayId,
      stepId,
      dto.completed,
    );
  }
}
