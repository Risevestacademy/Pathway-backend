import { Injectable, Logger } from '@nestjs/common';
import { ActivityType, Prisma } from '../generated/prisma/client';
import { ACTIVITY_XP } from './activity-xp';
import {
  computeStreak,
  DayCount,
  StreakSummary,
} from '../activity/activity-metrics';
import { TRACKED_ACTIVITY_TYPES } from './activity-types';
import { PrismaService } from '../prisma';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserStats(
    userId: string,
    now: Date = new Date(),
  ): Promise<{
    xp: number;
    streak: StreakSummary;
    activityDays: DayCount[];
  }> {
    const [sum, activityDays] = await Promise.all([
      this.prisma.activityLedger.aggregate({
        where: { userId },
        _sum: { xp: true },
      }),
      this.prisma.$queryRaw<DayCount[]>`
        SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "ActivityLedger"
        WHERE "userId" = ${userId}
          AND "type" = ANY(${TRACKED_ACTIVITY_TYPES}::"ActivityType"[])
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    return {
      xp: sum._sum.xp ?? 0,
      streak: computeStreak(activityDays, now),
      activityDays,
    };
  }

  async recordStepCompleted(
    userId: string,
    stepId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recordActivity(userId, ActivityType.STEP_COMPLETED, stepId, tx);
  }

  async recordTaskCompleted(
    userId: string,
    taskId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recordActivity(userId, ActivityType.TASK_COMPLETED, taskId, tx);
  }

  async recordResourceCompleted(
    userId: string,
    resourceId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recordActivity(
      userId,
      ActivityType.RESOURCE_COMPLETED,
      resourceId,
      tx,
    );
  }

  async recordQuizPassed(
    userId: string,
    quizId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recordActivity(userId, ActivityType.QUIZ_PASSED, quizId, tx);
  }

  async awardEarnedBadges(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;

    const { _sum } = await tx.activityLedger.aggregate({
      where: { userId },
      _sum: { xp: true },
    });
    const totalXp = _sum.xp ?? 0;

    const earned = await tx.badge.findMany({
      where: {
        xpThreshold: { lte: totalXp },
        users: { none: { userId } },
      },
      select: { id: true },
    });

    if (earned.length === 0) {
      return;
    }

    const awarded = await tx.userBadge.createManyAndReturn({
      data: earned.map(({ id }) => ({ userId, badgeId: id })),
      skipDuplicates: true,
      select: { badgeId: true },
    });

    for (const { badgeId } of awarded) {
      this.logger.log({ userId, badgeId }, 'Badge awarded');
    }
  }

  private async recordActivity(
    userId: string,
    type: ActivityType,
    referenceId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const xp = ACTIVITY_XP[type];
    if (xp === undefined) return;

    const { count } = await tx.activityLedger.createMany({
      data: [{ userId, type, referenceId, xp }],
      skipDuplicates: true,
    });

    if (count > 0) {
      this.logger.log({ userId, type, xp }, 'XP awarded');
    }
  }
}
