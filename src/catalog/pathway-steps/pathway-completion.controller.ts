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
import { PathwayCompletionService } from './pathway-completion.service';
import { SetItemCompletionDto } from './dto/set-item-completion.dto';
import { SetChecklistItemDto } from './dto/set-checklist-item.dto';
import { ResourceCompletionResponseDto } from './dto/resource-completion-response.dto';
import { TaskCompletionResponseDto } from './dto/task-completion-response.dto';
import { ChecklistItemResponseDto } from './dto/checklist-item-response.dto';

@ApiTags('Pathways')
@Controller('pathways')
@UseGuards(JwtAuthGuard)
export class PathwayCompletionController {
  constructor(
    private readonly pathwayStepsService: PathwayStepsService,
    private readonly pathwayCompletionService: PathwayCompletionService,
  ) {}

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

  @ApiOperation({
    summary: 'Mark or unmark a pathway resource as complete',
    description:
      'Idempotent. Completion is per user and shared across steps. Completing awards resource XP once. It never completes a step.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'resourceId', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: ResourceCompletionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'An id is not a valid UUID, or the body is invalid.',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid.' })
  @ApiResponse({
    status: 404,
    description:
      "The pathway isn't readable, the resource isn't linked to this pathway, or it's withdrawn and the request completes it.",
  })
  @ApiResponse({
    status: 409,
    description: "The user hasn't saved this pathway's career.",
  })
  @Put(':pathwayId/resources/:resourceId/completion')
  async setResourceCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Body() dto: SetItemCompletionDto,
  ): Promise<ResourceCompletionResponseDto> {
    return this.pathwayCompletionService.setResourceCompletion(
      user.id,
      pathwayId,
      resourceId,
      dto.completed,
    );
  }

  @ApiOperation({
    summary: 'Mark or unmark a practice task as complete',
    description:
      'Idempotent. Completing awards task XP once. It never completes a step.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'taskId', description: 'Practice task UUID' })
  @ApiResponse({ status: 200, type: TaskCompletionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'An id is not a valid UUID, or the body is invalid.',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid.' })
  @ApiResponse({
    status: 404,
    description: "The pathway isn't readable, or the task isn't in it.",
  })
  @ApiResponse({
    status: 409,
    description: "The user hasn't saved this pathway's career.",
  })
  @Put(':pathwayId/tasks/:taskId/completion')
  async setTaskCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SetItemCompletionDto,
  ): Promise<TaskCompletionResponseDto> {
    return this.pathwayCompletionService.setTaskCompletion(
      user.id,
      pathwayId,
      taskId,
      dto.completed,
    );
  }

  @ApiOperation({
    summary: "Tick or untick an item on a practice task's checklist",
    description: 'Idempotent. Awards no XP and never completes the task.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiParam({ name: 'taskId', description: 'Practice task UUID' })
  @ApiParam({ name: 'itemId', description: 'Checklist item UUID' })
  @ApiResponse({ status: 200, type: ChecklistItemResponseDto })
  @ApiResponse({
    status: 400,
    description: 'An id is not a valid UUID, or the body is invalid.',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid.' })
  @ApiResponse({
    status: 404,
    description:
      "The pathway isn't readable, the task isn't in it, or the item isn't on the task.",
  })
  @ApiResponse({
    status: 409,
    description: "The user hasn't saved this pathway's career.",
  })
  @Put(':pathwayId/tasks/:taskId/checklist/:itemId')
  async setChecklistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SetChecklistItemDto,
  ): Promise<ChecklistItemResponseDto> {
    return this.pathwayCompletionService.setChecklistItem(
      user.id,
      pathwayId,
      taskId,
      itemId,
      dto.checked,
    );
  }
}
