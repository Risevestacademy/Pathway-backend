import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  PathwayResourceDetailDto,
  PathwayResourcesDto,
} from './dto/pathway-resources.dto';
import { StageQuizDto } from './dto/stage-quiz.dto';
import {
  optionalPaidCoursesWhere,
  pathwayResourcesStageSelect,
  resourceDetailSelect,
  resourceIdsOf,
  resourceItemSelect,
  toPathwayResourceDetail,
  toPathwayResources,
} from './mappers/pathway-resources.mapper';
import { stageQuizReadSelect, toStageQuiz } from './mappers/stage-quiz.mapper';
import {
  assertPathwayReadable,
  assertResourceBelongsToPathway,
  loadResourceCompletions,
  loadTaskCompletions,
} from './pathway-access';

@Injectable()
export class PathwayLearningService {
  constructor(private readonly prisma: PrismaService) {}

  async getPathwayResources(
    userId: string,
    pathwayId: string,
  ): Promise<PathwayResourcesDto> {
    const { careerId } = await assertPathwayReadable(
      this.prisma,
      pathwayId,
      userId,
    );

    const [stages, marks, optionalPaidCourses] = await Promise.all([
      this.prisma.pathwayStage.findMany({
        where: { pathwayId },
        orderBy: { order: 'asc' },
        select: pathwayResourcesStageSelect(userId),
      }),
      this.prisma.userPathwayStep.findMany({
        where: { userId, pathwayStep: { pathwayId } },
        select: { pathwayStepId: true, status: true, completedAt: true },
      }),
      this.prisma.resource.findMany({
        where: optionalPaidCoursesWhere(careerId, pathwayId),
        orderBy: { title: 'asc' },
        select: resourceItemSelect,
      }),
    ]);

    const completions = await loadResourceCompletions(
      this.prisma,
      userId,
      resourceIdsOf(stages, optionalPaidCourses),
    );

    return toPathwayResources(
      pathwayId,
      stages,
      marks,
      optionalPaidCourses,
      completions,
    );
  }

  async getPathwayResource(
    userId: string,
    pathwayId: string,
    resourceId: string,
    stepId?: string,
  ): Promise<PathwayResourceDetailDto> {
    await assertPathwayReadable(this.prisma, pathwayId, userId);
    await assertResourceBelongsToPathway(this.prisma, resourceId, pathwayId);

    const [resource, stepLink, completions] = await Promise.all([
      this.prisma.resource.findUniqueOrThrow({
        where: { id: resourceId },
        select: resourceDetailSelect,
      }),
      stepId
        ? this.prisma.pathwayStepResource.findFirst({
            where: {
              pathwayStepId: stepId,
              resourceId,
              pathwayStep: { pathwayId },
            },
            select: {
              usageNote: true,
              pathwayStep: {
                select: {
                  tasks: {
                    orderBy: { order: 'asc' },
                    select: {
                      id: true,
                      title: true,
                      goal: true,
                      estimatedWeeks: true,
                    },
                  },
                },
              },
            },
          })
        : null,
      loadResourceCompletions(this.prisma, userId, [resourceId]),
    ]);

    if (stepId && !stepLink)
      throw new NotFoundException('Resource not found in this step');

    const tasks = stepLink?.pathwayStep.tasks ?? [];
    const taskCompletions = await loadTaskCompletions(
      this.prisma,
      userId,
      tasks.map(({ id }) => id),
    );

    return toPathwayResourceDetail(
      resource,
      completions,
      stepLink?.usageNote ?? null,
      tasks.find(({ id }) => !taskCompletions.has(id)) ?? null,
    );
  }

  async getStageQuiz(
    userId: string,
    pathwayId: string,
    stageId: string,
  ): Promise<StageQuizDto> {
    await assertPathwayReadable(this.prisma, pathwayId, userId);

    const quiz = await this.prisma.stageQuiz.findFirst({
      where: { stageId, stage: { pathwayId } },
      select: stageQuizReadSelect,
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    return toStageQuiz(quiz);
  }
}
