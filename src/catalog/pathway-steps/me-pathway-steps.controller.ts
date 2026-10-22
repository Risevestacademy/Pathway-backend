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
import { PathwaysService, StepStatusResponseDto } from '../pathways';
import { SetStepStatusDto } from './dto/set-step-status.dto';

@ApiTags('Me')
@Controller('me/pathway-steps')
@UseGuards(JwtAuthGuard)
export class MePathwayStepsController {
  constructor(private readonly pathwaysService: PathwaysService) {}

  @Put(':stepId')
  @ApiOperation({
    summary:
      'Mark a pathway step completed or not started for the signed-in user',
  })
  @ApiParam({ name: 'stepId', description: 'Pathway step UUID' })
  @ApiResponse({
    status: 200,
    description:
      "The new status and the updated progress for the step's pathway.",
    type: StepStatusResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'stepId is not a valid UUID, or the status is invalid.',
  })
  @ApiResponse({
    status: 401,
    description: 'Access token missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Step does not exist, or its career is neither PUBLISHED nor a RETIRED career the user saved.',
  })
  @ApiResponse({
    status: 409,
    description: "The user hasn't saved the step's career.",
  })
  async setStepStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: SetStepStatusDto,
  ): Promise<StepStatusResponseDto> {
    return this.pathwaysService.setStepStatus(user.id, stepId, dto.status);
  }
}
