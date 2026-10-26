import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { AnalyticsService } from '../analytics';
import { InviteStatus } from './teams.constants';
import { GetInvitesQueryDto } from './dto/get-invites-query.dto';
import { InviteListResponseDto } from './dto/invite-list-response.dto';
import { RevokeInviteResponseDto } from './dto/revoke-invite-response.dto';

type InviteState = {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

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
