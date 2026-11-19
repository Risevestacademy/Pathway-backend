import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ActivityService } from '../../activity';
import { ResourceStatus } from '../../generated/prisma/client';
import { ResourceCompletionResponseDto } from './dto/resource-completion-response.dto';
import { TaskCompletionResponseDto } from './dto/task-completion-response.dto';
import { ChecklistItemResponseDto } from './dto/checklist-item-response.dto';
import { readableCareerWhere } from './readable-career';

interface ReadablePathway {
  careerId: string;
  saved: boolean;
}

@Injectable()
export class PathwayCompletionService {
  private readonly logger = new Logger(PathwayCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async setResourceCompletion(
    userId: string,
    pathwayId: string,
    resourceId: string,
    completed: boolean,
  ): Promise<ResourceCompletionResponseDto> {
    const pathway = await this.findReadablePathway(userId, pathwayId);

    const resource = await this.prisma.resource.findFirst({
      where: {
        id: resourceId,
        ...(completed ? { status: ResourceStatus.ACTIVE } : {}),
        OR: [
          { pathwaySteps: { some: { pathwayStep: { pathwayId } } } },
          { careerResources: { some: { careerId: pathway.careerId } } },
        ],
      },
      select: { id: true },
    });

    if (!resource) {
      this.reject(userId, 'RESOURCE_NOT_FOUND', { resourceId });
      throw new NotFoundException('Resource not found');
    }

    this.assertSaved(userId, pathway);

    const { changed, completedAt, xpAwarded } = await this.prisma.$transaction(
      async (tx) => {
        let count: number;
        let xp = 0;

        if (completed) {
          ({ count } = await tx.userResourceCompletion.createMany({
            data: [{ userId, resourceId, completedAt: new Date() }],
            skipDuplicates: true,
          }));
          xp = await this.activity.recordResourceCompleted(
            userId,
            resourceId,
            tx,
          );
          if (xp > 0) {
            await this.activity.awardEarnedBadges(userId, tx);
          }
        } else {
          ({ count } = await tx.userResourceCompletion.deleteMany({
            where: { userId, resourceId },
          }));
        }

        const mark = await tx.userResourceCompletion.findUnique({
          where: { userId_resourceId: { userId, resourceId } },
          select: { completedAt: true },
        });

        return {
          changed: count > 0,
          completedAt: mark?.completedAt ?? null,
          xpAwarded: xp,
        };
      },
    );

    if (changed) {
      this.logger.log(
        { userId, resourceId, completed },
        'Resource completion changed',
      );
    }

    return { resourceId, completed, completedAt, xpAwarded };
  }

  async setTaskCompletion(
    userId: string,
    pathwayId: string,
    taskId: string,
    completed: boolean,
  ): Promise<TaskCompletionResponseDto> {
    const pathway = await this.findReadablePathway(userId, pathwayId);
    await this.findTask(userId, pathwayId, taskId);
    this.assertSaved(userId, pathway);

    const { changed, completedAt, xpAwarded } = await this.prisma.$transaction(
      async (tx) => {
        let changed: boolean;
        let xp = 0;

        if (completed) {
          const updated = await tx.userTask.updateMany({
            where: { userId, taskId, completedAt: null },
            data: { completedAt: new Date() },
          });
          const created =
            updated.count > 0
              ? { count: 0 }
              : await tx.userTask.createMany({
                  data: [{ userId, taskId, completedAt: new Date() }],
                  skipDuplicates: true,
                });
          changed = updated.count + created.count > 0;
          xp = await this.activity.recordTaskCompleted(userId, taskId, tx);
          if (xp > 0) {
            await this.activity.awardEarnedBadges(userId, tx);
          }
        } else {
          const updated = await tx.userTask.updateMany({
            where: { userId, taskId, completedAt: { not: null } },
            data: { completedAt: null },
          });
          changed = updated.count > 0;
        }

        const mark = await tx.userTask.findUnique({
          where: { userId_taskId: { userId, taskId } },
          select: { completedAt: true },
        });

        return {
          changed,
          completedAt: mark?.completedAt ?? null,
          xpAwarded: xp,
        };
      },
    );

    if (changed) {
      this.logger.log({ userId, taskId, completed }, 'Task completion changed');
    }

    return {
      taskId,
      completed,
      completedAt,
      xpAwarded,
      ...(await this.countChecklist(userId, taskId)),
    };
  }

  async setChecklistItem(
    userId: string,
    pathwayId: string,
    taskId: string,
    itemId: string,
    checked: boolean,
  ): Promise<ChecklistItemResponseDto> {
    const pathway = await this.findReadablePathway(userId, pathwayId);
    const [, item] = await Promise.all([
      this.findTask(userId, pathwayId, taskId),
      this.prisma.pathwayTaskChecklistItem.findFirst({
        where: { id: itemId, taskId },
        select: { id: true },
      }),
    ]);

    if (!item) {
      this.reject(userId, 'CHECKLIST_ITEM_NOT_FOUND', { taskId, itemId });
      throw new NotFoundException('Checklist item not found');
    }

    this.assertSaved(userId, pathway);

    const { count } = checked
      ? await this.prisma.userTaskChecklistItem.createMany({
          data: [{ userId, checklistItemId: itemId, checkedAt: new Date() }],
          skipDuplicates: true,
        })
      : await this.prisma.userTaskChecklistItem.deleteMany({
          where: { userId, checklistItemId: itemId },
        });

    if (count > 0) {
      this.logger.log({ userId, itemId, checked }, 'Checklist item changed');
    }

    const [mark, counts] = await Promise.all([
      this.prisma.userTaskChecklistItem.findUnique({
        where: {
          userId_checklistItemId: { userId, checklistItemId: itemId },
        },
        select: { checkedAt: true },
      }),
      this.countChecklist(userId, taskId),
    ]);

    return {
      itemId,
      taskId,
      checked,
      checkedAt: mark?.checkedAt ?? null,
      ...counts,
    };
  }

  private async findReadablePathway(
    userId: string,
    pathwayId: string,
  ): Promise<ReadablePathway> {
    const pathway = await this.prisma.pathway.findFirst({
      where: { id: pathwayId, career: readableCareerWhere(userId) },
      select: {
        careerId: true,
        career: {
          select: {
            userPathways: { where: { userId }, select: { id: true } },
          },
        },
      },
    });

    if (!pathway) {
      this.reject(userId, 'PATHWAY_NOT_FOUND', { pathwayId });
      throw new NotFoundException('Pathway not found');
    }

    return {
      careerId: pathway.careerId,
      saved: pathway.career.userPathways.length > 0,
    };
  }

  private async findTask(
    userId: string,
    pathwayId: string,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.pathwayStepTask.findFirst({
      where: { id: taskId, step: { pathwayId } },
      select: { id: true },
    });

    if (!task) {
      this.reject(userId, 'TASK_NOT_FOUND', { taskId });
      throw new NotFoundException('Task not found');
    }
  }

  private assertSaved(userId: string, pathway: ReadablePathway): void {
    if (!pathway.saved) {
      this.reject(userId, 'CAREER_NOT_SAVED', { careerId: pathway.careerId });
      throw new ConflictException(
        'Save this career before tracking its progress',
      );
    }
  }

  private async countChecklist(
    userId: string,
    taskId: string,
  ): Promise<{ checklistChecked: number; checklistTotal: number }> {
    const [checklistTotal, checklistChecked] = await Promise.all([
      this.prisma.pathwayTaskChecklistItem.count({ where: { taskId } }),
      this.prisma.userTaskChecklistItem.count({
        where: { userId, item: { taskId } },
      }),
    ]);

    return { checklistChecked, checklistTotal };
  }

  private reject(
    userId: string,
    reason: string,
    ids: Record<string, string>,
  ): void {
    this.logger.warn({ userId, ...ids, reason }, 'Completion update rejected');
  }
}
