import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityType, Prisma } from '../generated/prisma/client';
import { ActivityService } from './activity.service';
import { ACTIVITY_XP } from './activity-xp';

describe('ActivityService', () => {
  let service: ActivityService;
  let logSpy: jest.SpiedFunction<Logger['log']>;

  const tx = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    activityLedger: {
      createMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      aggregate: jest.fn<(args: unknown) => Promise<unknown>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    badge: { findMany: jest.fn<(args: unknown) => Promise<unknown[]>>() },
    userBadge: {
      createManyAndReturn: jest.fn<(args: unknown) => Promise<unknown[]>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };
  const client = tx as unknown as Prisma.TransactionClient;

  const totalXp = (xp: number | null) =>
    tx.activityLedger.aggregate.mockResolvedValue({ _sum: { xp } });

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    tx.activityLedger.createMany.mockResolvedValue({ count: 1 });
    totalXp(0);
    tx.badge.findMany.mockResolvedValue([]);
    tx.userBadge.createManyAndReturn.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivityService],
    }).compile();

    service = module.get(ActivityService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('defines the XP for a completed step', () => {
    expect(ACTIVITY_XP[ActivityType.STEP_COMPLETED]).toBe(50);
  });

  describe('recordStepCompleted', () => {
    it('inserts one ledger row through the passed transaction', async () => {
      await service.recordStepCompleted('user-1', 'step-1', client);

      expect(tx.activityLedger.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            type: ActivityType.STEP_COMPLETED,
            referenceId: 'step-1',
            xp: 50,
          },
        ],
        skipDuplicates: true,
      });
      expect(logSpy).toHaveBeenCalledWith(
        { userId: 'user-1', type: ActivityType.STEP_COMPLETED, xp: 50 },
        'XP awarded',
      );
    });

    it('ignores a duplicate insert and logs nothing', async () => {
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordStepCompleted('user-1', 'step-1', client),
      ).resolves.toBeUndefined();

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('never removes ledger rows', async () => {
      await service.recordStepCompleted('user-1', 'step-1', client);
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });
      await service.recordStepCompleted('user-1', 'step-1', client);

      expect(tx.activityLedger.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('awardEarnedBadges', () => {
    it("locks the user's row before summing XP", async () => {
      await service.awardEarnedBadges('user-1', client);

      const [strings, userId] = tx.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        string,
      ];
      expect(strings.join('?')).toContain('FOR NO KEY UPDATE');
      expect(userId).toBe('user-1');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.activityLedger.aggregate.mock.invocationCallOrder[0],
      );
    });

    it("looks for unearned badges at or below the user's total XP", async () => {
      totalXp(100);

      await service.awardEarnedBadges('user-1', client);

      expect(tx.activityLedger.aggregate).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        _sum: { xp: true },
      });
      expect(tx.badge.findMany).toHaveBeenCalledWith({
        where: {
          xpThreshold: { lte: 100 },
          users: { none: { userId: 'user-1' } },
        },
        select: { id: true },
      });
    });

    it('treats a user with no ledger rows as 0 XP', async () => {
      totalXp(null);

      await service.awardEarnedBadges('user-1', client);

      expect(tx.badge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ xpThreshold: { lte: 0 } }),
        }),
      );
    });

    it('awards a badge once its threshold is met', async () => {
      totalXp(50);
      tx.badge.findMany.mockResolvedValue([{ id: 'badge-1' }]);
      tx.userBadge.createManyAndReturn.mockResolvedValue([
        { badgeId: 'badge-1' },
      ]);

      await service.awardEarnedBadges('user-1', client);

      expect(tx.userBadge.createManyAndReturn).toHaveBeenCalledWith({
        data: [{ userId: 'user-1', badgeId: 'badge-1' }],
        skipDuplicates: true,
        select: { badgeId: true },
      });
      expect(logSpy).toHaveBeenCalledWith(
        { userId: 'user-1', badgeId: 'badge-1' },
        'Badge awarded',
      );
    });

    it('awards nothing when no threshold is met', async () => {
      totalXp(10);

      await service.awardEarnedBadges('user-1', client);

      expect(tx.userBadge.createManyAndReturn).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('does not re-award a badge on a repeated call', async () => {
      totalXp(50);
      tx.badge.findMany.mockResolvedValueOnce([{ id: 'badge-1' }]);
      tx.userBadge.createManyAndReturn.mockResolvedValueOnce([
        { badgeId: 'badge-1' },
      ]);

      await service.awardEarnedBadges('user-1', client);
      await service.awardEarnedBadges('user-1', client);

      expect(tx.userBadge.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('logs only the badges a concurrent award did not already insert', async () => {
      totalXp(250);
      tx.badge.findMany.mockResolvedValue([
        { id: 'badge-1' },
        { id: 'badge-2' },
      ]);
      tx.userBadge.createManyAndReturn.mockResolvedValue([
        { badgeId: 'badge-2' },
      ]);

      await service.awardEarnedBadges('user-1', client);

      expect(logSpy.mock.calls).toEqual([
        [{ userId: 'user-1', badgeId: 'badge-2' }, 'Badge awarded'],
      ]);
    });

    it('never removes badges', async () => {
      totalXp(0);

      await service.awardEarnedBadges('user-1', client);

      expect(tx.userBadge.deleteMany).not.toHaveBeenCalled();
    });
  });
});
