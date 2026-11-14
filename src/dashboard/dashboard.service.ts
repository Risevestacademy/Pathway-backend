import { Injectable } from '@nestjs/common';
import { PathwaysService } from '../catalog/pathways';
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
  computeStreak,
  DEFAULT_HEATMAP_DAYS,
  type DayCount,
} from './dashboard-metrics';
import {
  DashboardActivePathwayDto,
  DashboardDto,
  DashboardGoalsDto,
  DashboardTotalsDto,
} from './dto/dashboard-response.dto';

const VISIBLE_CAREER_STATUSES = [CareerStatus.PUBLISHED, CareerStatus.RETIRED];

const emptyGoals = (): DashboardGoalsDto => ({
  step: null,
  tasks: [],
  resources: [],
});

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pathwaysService: PathwaysService,
  ) {}

  async getDashboard(
    userId: string,
    windowDays: number = DEFAULT_HEATMAP_DAYS,
  ): Promise<DashboardDto> {
    const now = new Date();
    const window = buildDateWindow(now, windowDays);

    const [totals, badges, stepCompletionDays, activePathway] =
      await Promise.all([
        this.getTotals(userId),
        this.getBadges(userId),
        this.getStepCompletionDays(userId),
        this.getActivePathway(userId),
      ]);

    const todaysGoals = await this.getTodaysGoals(
      activePathway?.progress?.nextStepId ?? null,
    );

    return {
      totals: { ...totals, badgesEarned: badges.length },
      streak: computeStreak(stepCompletionDays, now),
      heatmap: { ...window, days: buildHeatmap(stepCompletionDays, window) },
      badges,
      activePathway,
      todaysGoals,
    };
  }

  private async getActivePathway(
    userId: string,
  ): Promise<DashboardActivePathwayDto | null> {
    const active = await this.prisma.userPathway.findFirst({
      where: {
        userId,
        isActive: true,
        career: { status: { in: VISIBLE_CAREER_STATUSES } },
      },
      select: { career: { select: { pathway: { select: { id: true } } } } },
    });

    const pathwayId = active?.career.pathway?.id;

    if (!pathwayId) {
      return null;
    }

    const pathway = await this.pathwaysService.getPathwayRead(
      pathwayId,
      userId,
    );

    return {
      pathwayId: pathway.id,
      career: pathway.career,
      progress: pathway.progress,
    };
  }

  private async getTotals(
    userId: string,
  ): Promise<Omit<DashboardTotalsDto, 'badgesEarned'>> {
    const [savedPathways, completedSteps, xp, badgesTotal] = await Promise.all([
      this.prisma.userPathway.count({
        where: { userId, career: { status: { in: VISIBLE_CAREER_STATUSES } } },
      }),
      this.prisma.userPathwayStep.count({
        where: { userId, status: PathwayStepStatus.COMPLETED },
      }),
      this.prisma.activityLedger.aggregate({
        where: { userId },
        _sum: { xp: true },
      }),
      this.prisma.badge.count(),
    ]);

    return {
      savedPathways,
      completedSteps,
      xp: xp._sum.xp ?? 0,
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

  private async getStepCompletionDays(userId: string): Promise<DayCount[]> {
    return this.prisma.$queryRaw<DayCount[]>`
      SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "ActivityLedger"
      WHERE "userId" = ${userId}
        AND "type" = ${ActivityType.STEP_COMPLETED}::"ActivityType"
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private async getTodaysGoals(
    nextStepId: string | null,
  ): Promise<DashboardGoalsDto> {
    if (!nextStepId) {
      return emptyGoals();
    }

    const step = await this.prisma.pathwayStep.findUnique({
      where: { id: nextStepId },
      select: {
        id: true,
        title: true,
        order: true,
        tasks: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            goal: true,
            estimatedWeeks: true,
            whatToMake: true,
            hints: true,
            checklistItems: {
              orderBy: { order: 'asc' },
              select: { text: true },
            },
          },
        },
        resources: {
          where: { resource: { status: ResourceStatus.ACTIVE } },
          orderBy: { resource: { title: 'asc' } },
          select: {
            resource: {
              select: {
                id: true,
                title: true,
                url: true,
                type: true,
                costStatus: true,
                estimatedWeeks: true,
                provider: true,
              },
            },
          },
        },
      },
    });

    if (!step) {
      return emptyGoals();
    }

    return {
      step: { id: step.id, title: step.title, order: step.order },
      tasks: step.tasks.map(({ checklistItems, ...task }) => ({
        ...task,
        checklist: checklistItems.map(({ text }) => text),
      })),
      resources: step.resources.map(({ resource }) => resource),
    };
  }
}
