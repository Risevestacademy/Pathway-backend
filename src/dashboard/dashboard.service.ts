import { Injectable } from '@nestjs/common';
import { PathwaysService } from '../catalog/pathways';
import type { PathwayReadStageDto } from '../catalog/pathways/dto/pathway-read.dto';
import { ACTIVITY_XP } from '../activity/activity-xp';
import {
  ActivityType,
  CareerStatus,
  PathwayStepStatus,
  ResourceStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import {
  buildDateWindow,
  buildHeatmap,
  buildWeekStrip,
  computeStreak,
  DEFAULT_HEATMAP_DAYS,
  type DayCount,
} from './dashboard-metrics';
import {
  DashboardActivePathwayDto,
  DashboardCurrentProjectDto,
  DashboardDto,
  DashboardGoalDto,
  DashboardTotalsDto,
} from './dto/dashboard-response.dto';
import { TRACKED_ACTIVITY_TYPES } from '../activity';
import { ActivityService } from '../activity/activity.service';

const VISIBLE_CAREER_STATUSES = [CareerStatus.PUBLISHED, CareerStatus.RETIRED];

interface ActivePathwayResult {
  dto: DashboardActivePathwayDto;
  stages: PathwayReadStageDto[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pathwaysService: PathwaysService,
    private readonly activityService: ActivityService,
  ) {}

  async getDashboard(
    userId: string,
    windowDays: number = DEFAULT_HEATMAP_DAYS,
  ): Promise<DashboardDto> {
    const now = new Date();
    const window = buildDateWindow(now, windowDays);

    const stats = await this.activityService.getUserStats(userId);

    const [totals, badges, activePathwayResult] = await Promise.all([
      this.getTotals(userId, stats.xp),
      this.getBadges(userId),
      this.getActivePathway(userId),
    ]);

    const goals = await this.getGoals(
      userId,
      activePathwayResult?.dto.progress.nextStepId ?? null,
    );

    return {
      totals: { ...totals, badgesEarned: badges.length },
      streak: stats.streak,
      weekStrip: buildWeekStrip(stats.activityDays, now, stats.streak.current),
      heatmap: { ...window, days: buildHeatmap(stats.activityDays, window) },
      badges,
      activePathway: activePathwayResult?.dto ?? null,
      currentProject: this.pickCurrentProject(activePathwayResult),
      goals,
    };
  }

  private async getActivePathway(
    userId: string,
  ): Promise<ActivePathwayResult | null> {
    const active = await this.prisma.userPathway.findFirst({
      where: {
        userId,
        isActive: true,
        career: { status: { in: VISIBLE_CAREER_STATUSES } },
      },
      select: { career: { select: { pathway: { select: { id: true } } } } },
    });

    const pathwayId = active?.career.pathway?.id;
    if (!pathwayId) return null;

    const pathway = await this.pathwaysService.getPathwayRead(
      pathwayId,
      userId,
    );

    if (!pathway.progress) return null;

    return {
      dto: {
        pathwayId: pathway.id,
        career: {
          id: pathway.career.id,
          title: pathway.career.title,
          description: pathway.career.description,
          retired: pathway.career.retired,
        },
        progress: {
          completed: pathway.progress.completed,
          total: pathway.progress.total,
          percentage: pathway.progress.percentage,
          nextStepId: pathway.progress.nextStepId,
          selfReported: pathway.progress.selfReported,
        },
      },
      stages: pathway.stages,
    };
  }

  private pickCurrentProject(
    activePathway: ActivePathwayResult | null,
  ): DashboardCurrentProjectDto | null {
    if (!activePathway) return null;

    const stage = activePathway.stages.find((s) =>
      s.steps.some(
        (step) =>
          (step.status ?? PathwayStepStatus.NOT_STARTED) !==
          PathwayStepStatus.COMPLETED,
      ),
    );
    if (!stage) return null;

    const steps = stage.steps.map((step) => ({
      id: step.id,
      title: step.title,
      order: step.order,
      status: step.status ?? PathwayStepStatus.NOT_STARTED,
    }));

    const completed = steps.filter(
      (s) => s.status === PathwayStepStatus.COMPLETED,
    ).length;
    const total = steps.length;

    return {
      stageId: stage.id,
      stageTitle: stage.title,
      stageDescription: stage.description ?? null,
      stageOrder: stage.order,
      completed,
      total,
      percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
      skills: [...new Set(stage.steps.flatMap((s) => s.skills))],
      steps,
    };
  }

  private async getTotals(
    userId: string,
    xp: number,
  ): Promise<Omit<DashboardTotalsDto, 'badgesEarned'>> {
    const [savedPathways, completedSteps, badgesTotal] = await Promise.all([
      this.prisma.userPathway.count({
        where: { userId, career: { status: { in: VISIBLE_CAREER_STATUSES } } },
      }),
      this.prisma.userPathwayStep.count({
        where: { userId, status: PathwayStepStatus.COMPLETED },
      }),
      this.prisma.badge.count(),
    ]);

    return {
      savedPathways,
      completedSteps,
      xp,
      badgesTotal,
    };
  }

  private async getBadges(userId: string) {
    const earned = await this.prisma.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
      select: {
        awardedAt: true,
        badge: {
          select: {
            id: true,
            name: true,
            description: true,
            iconKey: true,
            xpThreshold: true,
          },
        },
      },
    });

    return earned.map(({ awardedAt, badge }) => ({ ...badge, awardedAt }));
  }

  private async getActivityDays(userId: string): Promise<DayCount[]> {
    return this.prisma.$queryRaw<DayCount[]>`
      SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "ActivityLedger"
      WHERE "userId" = ${userId}
        AND "type" = ANY(${TRACKED_ACTIVITY_TYPES}::"ActivityType"[])
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private async getGoals(
    userId: string,
    nextStepId: string | null,
  ): Promise<DashboardGoalDto[]> {
    if (!nextStepId) return [];

    const step = await this.prisma.pathwayStep.findUnique({
      where: { id: nextStepId },
      select: {
        id: true,
        title: true,
        progress: {
          where: { userId },
          select: { status: true },
        },
        tasks: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            goal: true,
            completions: {
              where: { userId },
              select: { completedAt: true },
            },
            checklistItems: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                text: true,
                userChecks: {
                  where: { userId },
                  select: { checkedAt: true },
                },
              },
            },
          },
        },
        resources: {
          where: { resource: { status: ResourceStatus.ACTIVE } },
          orderBy: { resource: { title: 'asc' } },
          take: 1,
          select: {
            resource: {
              select: {
                id: true,
                title: true,
                url: true,
                completions: {
                  where: { userId },
                  select: { completedAt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!step) return [];

    const goals: DashboardGoalDto[] = [
      {
        kind: 'STEP',
        id: step.id,
        title: step.title,
        xp: ACTIVITY_XP[ActivityType.STEP_COMPLETED],
        done: step.progress[0]?.status === PathwayStepStatus.COMPLETED,
        goalDescription: null,
      },
    ];

    for (const task of step.tasks) {
      goals.push({
        kind: 'TASK',
        id: task.id,
        title: task.title,
        xp: ACTIVITY_XP[ActivityType.TASK_COMPLETED],
        done: task.completions.length > 0,
        goalDescription: task.goal,
      });

      for (const item of task.checklistItems) {
        goals.push({
          kind: 'CHECKLIST',
          id: item.id,
          title: item.text,
          xp: null,
          done: item.userChecks.length > 0,
          goalDescription: task.title,
        });
      }
    }

    const firstResource = step.resources[0]?.resource;
    if (firstResource) {
      goals.push({
        kind: 'RESOURCE',
        id: firstResource.id,
        title: firstResource.title,
        xp: ACTIVITY_XP[ActivityType.RESOURCE_COMPLETED],
        done: firstResource.completions.length > 0,
        goalDescription: firstResource.url,
      });
    }

    return goals;
  }
}
