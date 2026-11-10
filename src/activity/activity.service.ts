import { Injectable, Logger } from '@nestjs/common';
import { ActivityType, Prisma } from '../generated/prisma/client';
import { ACTIVITY_XP } from './activity-xp';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  async recordStepCompleted(
    userId: string,
    stepId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const type = ActivityType.STEP_COMPLETED;
    const xp = ACTIVITY_XP[type];

    const { count } = await tx.activityLedger.createMany({
      data: [{ userId, type, referenceId: stepId, xp }],
      skipDuplicates: true,
    });

    if (count > 0) {
      this.logger.log({ userId, type, xp }, 'XP awarded');
    }
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
}
