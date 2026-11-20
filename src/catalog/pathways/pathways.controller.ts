import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common';
import { CurrentUser, JwtAuthGuard, OptionalJwtAuthGuard } from '../../common';
import { PathwaysService } from './pathways.service';
import { PathwayLearningService } from './pathway-learning.service';
import { PathwayReadDto } from './dto/pathway-read.dto';
import {
  PathwayResourceDetailDto,
  PathwayResourcesDto,
} from './dto/pathway-resources.dto';
import { GetPathwayResourceQueryDto } from './dto/get-pathway-resource-query.dto';
import { StageQuizDto } from './dto/stage-quiz.dto';

@ApiTags('Pathways')
@Controller('pathways')
export class PathwaysController {
  constructor(
    private readonly pathwaysService: PathwaysService,
    private readonly pathwayLearningService: PathwayLearningService,
  ) {}

  @Get(':pathwayId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      "Get a pathway's overview, stage progress, and the next step's details",
    description:
      'Returns the career header, every stage with its steps, and progress. Resources and tasks are included only for the next step and the start step. Works for published and retired careers.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiResponse({ status: 200, type: PathwayReadDto })
  @ApiResponse({ status: 400, description: 'pathwayId is not a valid UUID.' })
  @ApiResponse({
    status: 404,
    description: 'Pathway not found, or its career is a draft.',
  })
  async getPathwayRead(
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<PathwayReadDto> {
    return this.pathwaysService.getPathwayRead(pathwayId, req.user?.id ?? null);
  }

  @Get(':pathwayId/resources')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get the pathway's Resources tab",
    description:
      "Every stage with its self-reported progress and quiz status, every step with its status and its ACTIVE resources, each with the caller's completion. optionalPaidCourses lists the career's PAID courses that no step uses. The career must be PUBLISHED, or RETIRED and saved by the caller. Reads only.",
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiResponse({ status: 200, type: PathwayResourcesDto })
  @ApiResponse({ status: 400, description: 'pathwayId is not a valid UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description:
      'Pathway not found, its career is a draft, or it is retired and not saved by the caller',
  })
  async getPathwayResources(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
  ): Promise<PathwayResourcesDto> {
    return this.pathwayLearningService.getPathwayResources(user.id, pathwayId);
  }

  @Get(':pathwayId/resources/:resourceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get one resource in a pathway',
    description:
      "The resource's description, outcomes and external link, with the caller's completion. With stepId, also the step's usage note and the first task in that step the caller hasn't completed. Reads only.",
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'resourceId', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: PathwayResourceDetailDto })
  @ApiResponse({
    status: 400,
    description: 'pathwayId, resourceId or stepId is not a valid UUID',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description:
      'Pathway not readable, the resource is withdrawn or not in this pathway, or stepId is not a step in this pathway that uses the resource',
  })
  async getPathwayResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Query() query: GetPathwayResourceQueryDto,
  ): Promise<PathwayResourceDetailDto> {
    return this.pathwayLearningService.getPathwayResource(
      user.id,
      pathwayId,
      resourceId,
      query.stepId,
    );
  }

  @Get(':pathwayId/stages/:stageId/quiz')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get a stage's quiz questions",
    description:
      'The quiz questions with their options, in display order. The correct option is never returned. Available again after a pass, so the quiz can be retaken. The career must be PUBLISHED, or RETIRED and saved by the caller. Reads only: a quiz never changes a step or stage completion.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'stageId', description: 'Stage UUID' })
  @ApiResponse({ status: 200, type: StageQuizDto })
  @ApiResponse({
    status: 400,
    description: 'pathwayId or stageId is not a valid UUID',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description:
      'Pathway not readable, the stage is not in this pathway, or the stage has no quiz',
  })
  async getStageQuiz(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ): Promise<StageQuizDto> {
    return this.pathwayLearningService.getStageQuiz(
      user.id,
      pathwayId,
      stageId,
    );
  }
}
