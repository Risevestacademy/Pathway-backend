import { jest } from '@jest/globals';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { TeamsService } from './teams.service';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { AnalyticsService } from '../analytics';
import { NotificationService } from '../notifications';

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

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

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
      create: jest.fn<(args: unknown) => Promise<InviteRow>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      // Callback-style transaction (used by createInvite)
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb(mockPrismaService);
    }),
  };

  const mockAnalyticsService = {
    capture: jest.fn(),
  };

  const mockNotificationService = {
    send: jest.fn<
      (to: string, template: string, data: unknown) => Promise<void>
    >(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STAFF_INVITE_URL')
        return 'https://pathway.example.com/accept-invite';
      return undefined;
    }),
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
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    mockPrismaService.staffInvite.create.mockImplementation(async (args) => {
      const { data } = args as {
        data: {
          email: string;
          role: InviteRow['role'];
          tokenHash: string;
          invitedById: string;
          expiresAt: Date;
        };
      };
      return {
        id: 'invite-1',
        email: data.email,
        role: data.role,
        invitedById: data.invitedById,
        expiresAt: data.expiresAt,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        invitedBy: { profile: { fullName: 'Ada Lovelace' } },
      };
    });
    mockPrismaService.staffInvite.deleteMany.mockResolvedValue({ count: 0 });
    mockNotificationService.send.mockResolvedValue(undefined);
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'STAFF_INVITE_URL')
        return 'https://pathway.example.com/accept-invite';
      return undefined;
    });

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

  describe('createInvite', () => {
    const dto = { email: 'new.editor@example.com', role: Role.EDITOR as const };
    const invitedById = 'admin-1';

    it('replaces any pending invite and creates a new one inside one transaction', async () => {
      await service.createInvite(dto, invitedById);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.staffInvite.deleteMany).toHaveBeenCalledWith({
        where: {
          email: 'new.editor@example.com',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gte: now },
        },
      });
      expect(
        mockPrismaService.staffInvite.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockPrismaService.staffInvite.create.mock.invocationCallOrder[0],
      );
    });

    it('stores a SHA-256 hash of the token, never the raw token', async () => {
      await service.createInvite(dto, invitedById);

      const [args] = mockPrismaService.staffInvite.create.mock.calls[0] as [
        { data: { tokenHash: string } },
      ];
      const [, , data] = mockNotificationService.send.mock.calls[0] as [
        string,
        string,
        { inviteUrl: string },
      ];
      const rawToken = new URL(data.inviteUrl).searchParams.get('token')!;

      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(args.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(args.data.tokenHash).toBe(sha256(rawToken));
      expect(args.data.tokenHash).not.toBe(rawToken);
    });

    it('sets expiresAt exactly 24 hours after now', async () => {
      await service.createInvite(dto, invitedById);

      const [args] = mockPrismaService.staffInvite.create.mock.calls[0] as [
        { data: { expiresAt: Date } },
      ];
      expect(args.data.expiresAt.getTime() - now.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
    });

    it('lowercases the email before storing and matching', async () => {
      await service.createInvite(
        { email: 'NEW.Editor@Example.COM', role: Role.EDITOR },
        invitedById,
      );

      expect(mockPrismaService.staffInvite.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'new.editor@example.com',
          }),
        }),
      );
      expect(mockPrismaService.staffInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new.editor@example.com',
          }),
        }),
      );
    });

    it('sends the invite email with the role, 24h TTL, and a URL containing the raw token', async () => {
      await service.createInvite(dto, invitedById);

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'new.editor@example.com',
        'staff-invite',
        expect.objectContaining({
          role: Role.EDITOR,
          expiresInHours: 24,
        }),
      );

      const [, , data] = mockNotificationService.send.mock.calls[0] as [
        string,
        string,
        { inviteUrl: string },
      ];
      const url = new URL(data.inviteUrl);
      expect(url.origin + url.pathname).toBe(
        'https://pathway.example.com/accept-invite',
      );
      expect(url.searchParams.get('token')).toMatch(/^[0-9a-f]{64}$/);

      // The raw token in the URL hashes to the stored hash.
      const [insertArgs] = mockPrismaService.staffInvite.create.mock
        .calls[0] as [{ data: { tokenHash: string } }];
      expect(insertArgs.data.tokenHash).toBe(
        sha256(url.searchParams.get('token')!),
      );
    });

    it('returns emailSent: true on success, with no message', async () => {
      const result = await service.createInvite(dto, invitedById);

      expect(result.emailSent).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result).toMatchObject({
        id: 'invite-1',
        email: 'new.editor@example.com',
        role: Role.EDITOR,
      });
    });

    it('keeps the invite and returns emailSent: false when the send fails', async () => {
      mockNotificationService.send.mockRejectedValueOnce(
        new Error('resend down'),
      );

      const result = await service.createInvite(dto, invitedById);

      expect(result.emailSent).toBe(false);
      expect(result.message).toMatch(/Re-invite to retry/);
      // The row was created; deleteMany + create ran.
      expect(mockPrismaService.staffInvite.create).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          inviteId: 'invite-1',
          invitedById,
          error: expect.objectContaining({ message: 'resend down' }),
        }),
        'Staff invite email dispatch failed',
      );
    });

    it('emits staff_invite_sent with the inviter id and role, only on success', async () => {
      await service.createInvite(dto, invitedById);

      expect(mockAnalyticsService.capture).toHaveBeenCalledWith(
        'staff_invite_sent',
        invitedById,
        { role: Role.EDITOR },
      );
    });

    it('does not emit staff_invite_sent when the send fails', async () => {
      mockNotificationService.send.mockRejectedValueOnce(new Error('down'));

      await service.createInvite(dto, invitedById);

      const events = (mockAnalyticsService.capture as jest.Mock).mock.calls.map(
        ([event]) => event,
      );
      expect(events).not.toContain('staff_invite_sent');
    });

    it('emits after the email dispatch, outside the transaction', async () => {
      await service.createInvite(dto, invitedById);

      const txOrder =
        mockPrismaService.$transaction.mock.invocationCallOrder[0];
      const sendOrder =
        mockNotificationService.send.mock.invocationCallOrder[0];
      const captureOrder =
        mockAnalyticsService.capture.mock.invocationCallOrder[0];

      expect(txOrder).toBeLessThan(sendOrder);
      expect(sendOrder).toBeLessThan(captureOrder);
    });

    it.each([
      ['an empty string', ''],
      ['undefined', undefined],
    ])(
      'produces a well-formed URL for STAFF_INVITE_URL = %s',
      async (_label, value) => {
        mockConfigService.get.mockImplementation((key: string) =>
          key === 'STAFF_INVITE_URL' ? value : undefined,
        );

        await expect(
          service.createInvite(dto, invitedById),
        ).resolves.toBeDefined();
        // URL construction failing would surface as emailSent: false with
        // the warn log, not a throw — that's the intended behavior.
      },
    );

    it('never logs the raw token, the hash, or the email', async () => {
      await service.createInvite(dto, invitedById);

      const [, , data] = mockNotificationService.send.mock.calls[0] as [
        string,
        string,
        { inviteUrl: string },
      ];
      const rawToken = new URL(data.inviteUrl).searchParams.get('token')!;
      const [insertArgs] = mockPrismaService.staffInvite.create.mock
        .calls[0] as [{ data: { tokenHash: string } }];

      const logged = JSON.stringify([
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
      ]);
      expect(logged).not.toContain(rawToken);
      expect(logged).not.toContain(insertArgs.data.tokenHash);
      expect(logged).not.toContain('new.editor@example.com');
    });
  });
});
