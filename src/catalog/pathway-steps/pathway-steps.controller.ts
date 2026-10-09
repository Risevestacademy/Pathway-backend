import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common';
import { PathwayStepsService } from './pathway-steps.service';
import { PathwayStepDetailDto } from './dto/pathway-step-detail.dto';

@ApiTags('Pathway Steps')
@Controller('pathway-steps')
export class PathwayStepsController {
  constructor(private readonly pathwayStepsService: PathwayStepsService) {}

  @Get(':stepId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get a single pathway step with its skills and resources',
  })
  @ApiParam({ name: 'stepId', description: 'Pathway step UUID' })
  @ApiResponse({
    status: 200,
    description:
      'The step with its skills and active resources, each resource with its skills.',
    type: PathwayStepDetailDto,
  })
  @ApiResponse({
    status: 400,
    description: 'stepId is not a valid UUID.',
  })
  @ApiResponse({
    status: 401,
    description: 'Access token missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Step does not exist, or belongs to a career that is not PUBLISHED.',
  })
  async getPathwayStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<PathwayStepDetailDto> {
    return this.pathwayStepsService.getPathwayStepById(stepId);
  }
}
