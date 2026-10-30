import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { AnalyticsService } from '../analytics';
import { NotificationService } from '../notifications';
import { EnvironmentVariables } from '../config';
import { InviteStatus } from './teams.constants';
import { GetInvitesQueryDto } from './dto/get-invites-query.dto';
import { InviteListResponseDto } from './dto/invite-list-response.dto';
import { RevokeInviteResponseDto } from './dto/revoke-invite-response.dto';
import { CreateStaffInviteDto } from './dto/create-staff-invite.dto';
import { CreateStaffInviteResponseDto } from './dto/create-staff-invite-response.dto';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

// Provider errors can carry the recipient and the rendered email
const describeSendError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode:
        'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    return {
      message:
        typeof obj.message === 'string' ? obj.message : JSON.stringify(obj),
      statusCode:
        typeof obj.statusCode === 'number' ? obj.statusCode : undefined,
    };
  }

  return {
    message: typeof error === 'string' ? error : String(error),
    statusCode: undefined,
  };
};

type InviteState = {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

type InviteClient = Pick<PrismaService, 'staffInvite'>;

export type InviteClaimFailure =
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED'
  | 'INVITE_ALREADY_ACCEPTED'
  | 'INVITE_EMAIL_MISMATCH'
  | 'EMAIL_NOT_VERIFIED';

export type InviteClaim =
  | { claimed: true; inviteId: string; role: Role }
  | { claimed: false; reason: InviteClaimFailure };

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createInvite(
    dto: CreateStaffInviteDto,
    invitedById: string,
  ): Promise<CreateStaffInviteResponseDto> {
    const email = dto.email.toLowerCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const invite = await this.prisma.$transaction(async (tx) => {
      // Replace any pending invite for this email. Accepted / revoked /
      // expired rows are untouched — history is preserved.
      await tx.staffInvite.deleteMany({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gte: now },
        },
      });

      return tx.staffInvite.create({
        data: {
          email,
          role: dto.role,
          tokenHash,
          invitedById,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
        },
      });
    });

    this.logger.log(
      { inviteId: invite.id, invitedById, role: invite.role },
      'Staff invite created',
    );

    const emailSent = await this.sendInviteEmail(invite, rawToken, invitedById);

    if (emailSent) {
      this.analytics.capture('staff_invite_sent', invitedById, {
        role: invite.role,
      });
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      emailSent,
      ...(emailSent
        ? {}
        : {
            message:
              'Invite created, but the email could not be sent. Re-invite to retry.',
          }),
    };
  }

  async claimInvite(
    token: string,
    claimant: { email: string; emailVerifiedAt: Date | null },
    client: InviteClient = this.prisma,
  ): Promise<InviteClaim> {
    const now = new Date();
    const invite = await client.staffInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    if (!invite || invite.revokedAt)
      return { claimed: false, reason: 'INVITE_NOT_FOUND' };

    if (invite.expiresAt < now)
      return { claimed: false, reason: 'INVITE_EXPIRED' };

    if (invite.acceptedAt)
      return { claimed: false, reason: 'INVITE_ALREADY_ACCEPTED' };

    if (invite.email !== claimant.email.toLowerCase())
      return { claimed: false, reason: 'INVITE_EMAIL_MISMATCH' };

    if (!claimant.emailVerifiedAt)
      return { claimed: false, reason: 'EMAIL_NOT_VERIFIED' };

    const accepted = await client.staffInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (accepted.count === 0)
      return { claimed: false, reason: 'INVITE_ALREADY_ACCEPTED' };

    return { claimed: true, inviteId: invite.id, role: invite.role };
  }

  private async sendInviteEmail(
    invite: { id: string; email: string; role: Role },
    rawToken: string,
    invitedById: string,
  ): Promise<boolean> {
    try {
      const inviteUrl = new URL(
        this.configService.get<string>('STAFF_INVITE_URL', { infer: true }),
      );
      inviteUrl.searchParams.set('token', rawToken);

      await this.notificationService.send(invite.email, 'staff-invite', {
        role: invite.role,
        inviteUrl: inviteUrl.toString(),
        expiresInHours: 24,
      });

      return true;
    } catch (error) {
      this.logger.warn(
        {
          inviteId: invite.id,
          invitedById,
          error: describeSendError(error),
        },
        'Staff invite email dispatch failed',
      );
      return false;
    }
  }

  async getInvites({
    status,
    page,
    limit,
  }: GetInvitesQueryDto): Promise<InviteListResponseDto> {
    const now = new Date();
    const where = status ? this.statusWhere(status, now) : {};

    const [invites, total] = await this.prisma.$transaction([
      this.prisma.staffInvite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          invitedById: true,
          createdAt: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          invitedBy: { select: { profile: { select: { fullName: true } } } },
        },
      }),
      this.prisma.staffInvite.count({ where }),
    ]);

    const items = invites.map(({ invitedBy, ...invite }) => ({
      ...invite,
      status: this.statusOf(invite, now),
      invitedByName: invitedBy.profile?.fullName ?? null,
    }));

    return { items, total, page, limit };
  }

  async revokeInvite(
    id: string,
    adminId: string,
  ): Promise<RevokeInviteResponseDto> {
    const now = new Date();
    let role: Role;
    try {
      ({ role } = await this.prisma.staffInvite.update({
        where: { id, AND: this.statusWhere(InviteStatus.PENDING, now) },
        data: { revokedAt: now },
        select: { role: true },
      }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return this.rejectRevoke(id, adminId, now);
      }
      throw error;
    }

    this.logger.log({ inviteId: id, adminId }, 'Staff invite revoked');
    this.analytics.capture('staff_invite_revoked', adminId, { role });

    return { message: 'Invite revoked' };
  }

  private async rejectRevoke(
    id: string,
    adminId: string,
    now: Date,
  ): Promise<never> {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { id },
      select: { expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    this.logger.warn(
      {
        inviteId: id,
        adminId,
        status: this.statusOf(invite, now),
        reason: 'INVITE_NOT_PENDING',
      },
      'Staff invite revoke rejected',
    );
    throw new ConflictException('Only a pending invite can be revoked');
  }

  private statusOf(invite: InviteState, now: Date): InviteStatus {
    if (invite.acceptedAt) return InviteStatus.ACCEPTED;
    if (invite.revokedAt) return InviteStatus.REVOKED;
    if (invite.expiresAt < now) return InviteStatus.EXPIRED;
    return InviteStatus.PENDING;
  }

  private statusWhere(
    status: InviteStatus,
    now: Date,
  ): Prisma.StaffInviteWhereInput {
    switch (status) {
      case InviteStatus.ACCEPTED:
        return { acceptedAt: { not: null } };
      case InviteStatus.REVOKED:
        return { acceptedAt: null, revokedAt: { not: null } };
      case InviteStatus.EXPIRED:
        return { acceptedAt: null, revokedAt: null, expiresAt: { lt: now } };
      case InviteStatus.PENDING:
        return { acceptedAt: null, revokedAt: null, expiresAt: { gte: now } };
    }
  }
}
