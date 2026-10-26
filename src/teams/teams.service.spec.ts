import { jest } from '@jest/globals';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { AnalyticsService } from '../analytics';

type InviteRow = {
  id: string;
  email: string;
  role: 'EDITOR' | 'REVIEWER' | 'PUBLISHER' | 'ADMIN';
  invitedById: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { profile: { fullName: string | null } | null };
};

type InviteState = Pick<InviteRow, 'expiresAt' | 'acceptedAt' | 'revokedAt'>;

describe('TeamsService', () => {
  let service: TeamsService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const now = new Date('2026-10-26T12:00:00.000Z');
  const later = new Date('2026-10-30T12:00:00.000Z');
  const earlier = new Date('2026-10-20T12:00:00.000Z');

  const mockPrismaService = {
    staffInvite: {
      findMany: jest.fn<(args: unknown) => Promise<InviteRow[]>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
      findUnique: jest.fn<(args: unknown) => Promise<InviteState | null>>(),
      update:
        jest.fn<(args: unknown) => Promise<{ role: InviteRow['role'] }>>(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  const mockAnalyticsService = {
    capture: jest.fn(),
  };

  const row = (overrides: Partial<InviteRow> = {}): InviteRow => ({
    id: 'invite-1',
    email: 'new.editor@example.com',
    role: 'EDITOR',
    invitedById: 'admin-1',
    createdAt: earlier,
    expiresAt: later,
    acceptedAt: null,
    revokedAt: null,
    invitedBy: { profile: { fullName: 'Ada Lovelace' } },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });
    mockPrismaService.staffInvite.findMany.mockResolvedValue([]);
    mockPrismaService.staffInvite.count.mockResolvedValue(0);
    mockPrismaService.staffInvite.update.mockResolvedValue({
      role: 'REVIEWER',
    });
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    logSpy.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getInvites', () => {
    it('pages newest first with no filter and returns the totals', async () => {
      mockPrismaService.staffInvite.count.mockResolvedValue(45);

      const result = await service.getInvites({ page: 3, limit: 20 });

      expect(mockPrismaService.staffInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 40,
          take: 20,
        }),
      );
      expect(mockPrismaService.staffInvite.count).toHaveBeenCalledWith({
        where: {},
      });
      expect(result).toEqual({ items: [], total: 45, page: 3, limit: 20 });
    });

    it('never selects tokenHash', async () => {
      await service.getInvites({ page: 1, limit: 20 });

      const [args] = mockPrismaService.staffInvite.findMany.mock.calls[0] as [
        { select: Record<string, unknown> },
      ];
      expect(args.select).not.toHaveProperty('tokenHash');
    });

    it.each([
      ['ACCEPTED', { acceptedAt: { not: null } }],
      ['REVOKED', { acceptedAt: null, revokedAt: { not: null } }],
      [
        'EXPIRED',
        { acceptedAt: null, revokedAt: null, expiresAt: { lt: now } },
      ],
      [
        'PENDING',
        { acceptedAt: null, revokedAt: null, expiresAt: { gte: now } },
      ],
    ] as const)(
      'filters %s invites against the current time',
      async (status, where) => {
        await service.getInvites({ status, page: 1, limit: 20 });

        expect(mockPrismaService.staffInvite.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where }),
        );
        expect(mockPrismaService.staffInvite.count).toHaveBeenCalledWith({
          where,
        });
      },
    );

    it("computes each invite's status and flattens the inviter's name", async () => {
      mockPrismaService.staffInvite.findMany.mockResolvedValue([
        row({ id: 'pending' }),
        row({ id: 'expired', expiresAt: new Date(now.getTime() - 1) }),
        row({ id: 'expires-now', expiresAt: now }),
        row({ id: 'accepted', acceptedAt: earlier, expiresAt: earlier }),
        row({ id: 'revoked', revokedAt: earlier }),
        row({ id: 'no-profile', invitedBy: { profile: null } }),
      ]);

      const { items } = await service.getInvites({ page: 1, limit: 20 });

      expect(items.map(({ id, status }) => [id, status])).toEqual([
        ['pending', 'PENDING'],
        ['expired', 'EXPIRED'],
        ['expires-now', 'PENDING'],
        ['accepted', 'ACCEPTED'],
        ['revoked', 'REVOKED'],
        ['no-profile', 'PENDING'],
      ]);
      expect(items[0]).toEqual({
        id: 'pending',
        email: 'new.editor@example.com',
        role: 'EDITOR',
        status: 'PENDING',
        invitedById: 'admin-1',
        invitedByName: 'Ada Lovelace',
        createdAt: earlier,
        expiresAt: later,
        acceptedAt: null,
        revokedAt: null,
      });
      expect(items[5].invitedByName).toBeNull();
      expect(items[0]).not.toHaveProperty('invitedBy');
    });
  });

  describe('revokeInvite', () => {
    const notFound = () =>
      new Prisma.PrismaClientKnownRequestError('No record was found', {
        code: 'P2025',
        clientVersion: 'test',
      });

    it('sets revokedAt in one update that only matches a pending invite', async () => {
      const result = await service.revokeInvite('invite-1', 'admin-1');

      expect(mockPrismaService.staffInvite.update).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          AND: { acceptedAt: null, revokedAt: null, expiresAt: { gte: now } },
        },
        data: { revokedAt: now },
        select: { role: true },
      });
      expect(mockPrismaService.staffInvite.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Invite revoked' });
    });

    it("logs the invite and admin ids and emits staff_invite_revoked with the invite's role", async () => {
      await service.revokeInvite('invite-1', 'admin-1');

      expect(logSpy).toHaveBeenCalledWith(
        { inviteId: 'invite-1', adminId: 'admin-1' },
        'Staff invite revoked',
      );
      expect(mockAnalyticsService.capture).toHaveBeenCalledWith(
        'staff_invite_revoked',
        'admin-1',
        { role: 'REVIEWER' },
      );
    });

    it('throws NotFoundException when no invite has the id', async () => {
      mockPrismaService.staffInvite.update.mockRejectedValue(notFound());
      mockPrismaService.staffInvite.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeInvite('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it.each([
      ['ACCEPTED', { expiresAt: later, acceptedAt: earlier, revokedAt: null }],
      ['REVOKED', { expiresAt: later, acceptedAt: null, revokedAt: earlier }],
      [
        'EXPIRED',
        {
          expiresAt: new Date(now.getTime() - 1),
          acceptedAt: null,
          revokedAt: null,
        },
      ],
    ] as const)(
      'throws ConflictException and warns with the status for an %s invite',
      async (status, invite) => {
        mockPrismaService.staffInvite.update.mockRejectedValue(notFound());
        mockPrismaService.staffInvite.findUnique.mockResolvedValue(invite);

        await expect(
          service.revokeInvite('invite-1', 'admin-1'),
        ).rejects.toThrow(
          new ConflictException('Only a pending invite can be revoked'),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          {
            inviteId: 'invite-1',
            adminId: 'admin-1',
            status,
            reason: 'INVITE_NOT_PENDING',
          },
          'Staff invite revoke rejected',
        );
        expect(logSpy).not.toHaveBeenCalled();
        expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
      },
    );

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.staffInvite.update.mockRejectedValue(failure);

      await expect(service.revokeInvite('invite-1', 'admin-1')).rejects.toBe(
        failure,
      );
      expect(mockPrismaService.staffInvite.findUnique).not.toHaveBeenCalled();
    });

    it('never reads or logs the invitee email', async () => {
      mockPrismaService.staffInvite.update.mockRejectedValue(notFound());
      mockPrismaService.staffInvite.findUnique.mockResolvedValue({
        expiresAt: later,
        acceptedAt: earlier,
        revokedAt: null,
      });

      await expect(
        service.revokeInvite('invite-1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      mockPrismaService.staffInvite.update.mockResolvedValue({
        role: 'EDITOR',
      });
      await service.revokeInvite('invite-1', 'admin-1');

      const queried = JSON.stringify([
        ...mockPrismaService.staffInvite.update.mock.calls,
        ...mockPrismaService.staffInvite.findUnique.mock.calls,
      ]);
      expect(queried).not.toContain('email');
      const logged = JSON.stringify([
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
      ]);
      expect(logged).not.toContain('email');
    });
  });
});
