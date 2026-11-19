import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityType, Prisma } from '../generated/prisma/client';
import { ActivityService } from './activity.service';
import { ACTIVITY_XP } from './activity-xp';
import { PrismaService } from '../prisma';

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
    badge: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
    },
    userBadge: {
      createManyAndReturn: jest.fn<(args: unknown) => Promise<unknown[]>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    activityLedger: {
      aggregate: jest.fn<() => Promise<{ _sum: { xp: number | null } }>>(),
    },
    $queryRaw: jest.fn<() => Promise<unknown[]>>(),
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
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
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

  describe('ACTIVITY_XP', () => {
    it('defines XP for every supported activity type', () => {
      expect(ACTIVITY_XP[ActivityType.STEP_COMPLETED]).toBe(50);
      expect(ACTIVITY_XP[ActivityType.TASK_COMPLETED]).toBeDefined();
      expect(ACTIVITY_XP[ActivityType.RESOURCE_COMPLETED]).toBeDefined();
      expect(ACTIVITY_XP[ActivityType.QUIZ_PASSED]).toBeDefined();
    });
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
            xp: ACTIVITY_XP[ActivityType.STEP_COMPLETED],
          },
        ],
        skipDuplicates: true,
      });

      expect(logSpy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          type: ActivityType.STEP_COMPLETED,
          xp: ACTIVITY_XP[ActivityType.STEP_COMPLETED],
        },
        'XP awarded',
      );
    });

    it('writes the ledger row for an opted-out user', async () => {
      await service.recordStepCompleted('opted-out-user', 'step-1', client);

      expect(tx.activityLedger.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ userId: 'opted-out-user' })],
        }),
      );
    });

    it('returns the XP awarded for a first completion', async () => {
      await expect(
        service.recordStepCompleted('user-1', 'step-1', client),
      ).resolves.toBe(ACTIVITY_XP[ActivityType.STEP_COMPLETED]);
    });

    it('ignores a duplicate insert, returns 0 and logs nothing', async () => {
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordStepCompleted('user-1', 'step-1', client),
      ).resolves.toBe(0);

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('never removes ledger rows', async () => {
      await service.recordStepCompleted('user-1', 'step-1', client);

      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await service.recordStepCompleted('user-1', 'step-1', client);

      expect(tx.activityLedger.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('recordTaskCompleted', () => {
    it('returns the XP awarded, or 0 on a duplicate', async () => {
      await expect(
        service.recordTaskCompleted('user-1', 'task-1', client),
      ).resolves.toBe(ACTIVITY_XP[ActivityType.TASK_COMPLETED]);

      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordTaskCompleted('user-1', 'task-1', client),
      ).resolves.toBe(0);
    });

    it('inserts a task completion ledger row', async () => {
      await service.recordTaskCompleted('user-1', 'task-1', client);

      expect(tx.activityLedger.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            type: ActivityType.TASK_COMPLETED,
            referenceId: 'task-1',
            xp: ACTIVITY_XP[ActivityType.TASK_COMPLETED],
          },
        ],
        skipDuplicates: true,
      });
    });

    it('logs XP awarded for a completed task', async () => {
      await service.recordTaskCompleted('user-1', 'task-1', client);

      expect(logSpy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          type: ActivityType.TASK_COMPLETED,
          xp: ACTIVITY_XP[ActivityType.TASK_COMPLETED],
        },
        'XP awarded',
      );
    });

    it('does not log XP when the task completion is a duplicate', async () => {
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await service.recordTaskCompleted('user-1', 'task-1', client);

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordResourceCompleted', () => {
    it('returns the XP awarded, or 0 on a duplicate', async () => {
      await expect(
        service.recordResourceCompleted('user-1', 'resource-1', client),
      ).resolves.toBe(ACTIVITY_XP[ActivityType.RESOURCE_COMPLETED]);

      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordResourceCompleted('user-1', 'resource-1', client),
      ).resolves.toBe(0);
    });

    it('inserts a resource completion ledger row', async () => {
      await service.recordResourceCompleted('user-1', 'resource-1', client);

      expect(tx.activityLedger.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            type: ActivityType.RESOURCE_COMPLETED,
            referenceId: 'resource-1',
            xp: ACTIVITY_XP[ActivityType.RESOURCE_COMPLETED],
          },
        ],
        skipDuplicates: true,
      });
    });

    it('logs XP awarded for a completed resource', async () => {
      await service.recordResourceCompleted('user-1', 'resource-1', client);

      expect(logSpy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          type: ActivityType.RESOURCE_COMPLETED,
          xp: ACTIVITY_XP[ActivityType.RESOURCE_COMPLETED],
        },
        'XP awarded',
      );
    });

    it('does not log XP when the resource completion is a duplicate', async () => {
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await service.recordResourceCompleted('user-1', 'resource-1', client);

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordQuizPassed', () => {
    it('returns the XP awarded, or 0 on a duplicate', async () => {
      await expect(
        service.recordQuizPassed('user-1', 'quiz-1', client),
      ).resolves.toBe(ACTIVITY_XP[ActivityType.QUIZ_PASSED]);

      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordQuizPassed('user-1', 'quiz-1', client),
      ).resolves.toBe(0);
    });

    it('inserts a quiz passed ledger row', async () => {
      await service.recordQuizPassed('user-1', 'quiz-1', client);

      expect(tx.activityLedger.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            type: ActivityType.QUIZ_PASSED,
            referenceId: 'quiz-1',
            xp: ACTIVITY_XP[ActivityType.QUIZ_PASSED],
          },
        ],
        skipDuplicates: true,
      });
    });

    it('logs XP awarded for a passed quiz', async () => {
      await service.recordQuizPassed('user-1', 'quiz-1', client);

      expect(logSpy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          type: ActivityType.QUIZ_PASSED,
          xp: ACTIVITY_XP[ActivityType.QUIZ_PASSED],
        },
        'XP awarded',
      );
    });

    it('does not log XP when the quiz pass is a duplicate', async () => {
      tx.activityLedger.createMany.mockResolvedValue({ count: 0 });

      await service.recordQuizPassed('user-1', 'quiz-1', client);

      expect(logSpy).not.toHaveBeenCalled();
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
          where: expect.objectContaining({
            xpThreshold: { lte: 0 },
          }),
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

    it('logs only badges a concurrent award did not already insert', async () => {
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

  describe('getUserStats', () => {
    it('returns xp, streak, and activityDays', async () => {
      mockPrismaService.activityLedger.aggregate.mockResolvedValue({
        _sum: { xp: 100 },
      });
      mockPrismaService.$queryRaw.mockResolvedValue([
        { date: '2026-11-14', count: 1 },
      ]);

      const result = await service.getUserStats(
        'user-1',
        new Date('2026-11-14T08:00:00.000Z'),
      );

      expect(result.xp).toBe(100);
      expect(result.streak.current).toBe(1);
      expect(result.activityDays).toEqual([{ date: '2026-11-14', count: 1 }]);
    });

    it('returns 0 xp and no streak for a fresh user', async () => {
      mockPrismaService.activityLedger.aggregate.mockResolvedValue({
        _sum: { xp: null },
      });
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getUserStats('user-1');

      expect(result.xp).toBe(0);
      expect(result.streak.current).toBe(0);
      expect(result.activityDays).toEqual([]);
    });
  });
});
