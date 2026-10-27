import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../common';
import { Role } from '../generated/prisma/client';
import { TeamsService } from './teams.service';
import { GetInvitesQueryDto } from './dto/get-invites-query.dto';
import { InviteListResponseDto } from './dto/invite-list-response.dto';
import { RevokeInviteResponseDto } from './dto/revoke-invite-response.dto';
import { CreateStaffInviteDto } from './dto/create-staff-invite.dto';
import { CreateStaffInviteResponseDto } from './dto/create-staff-invite-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@MinRole(Role.ADMIN)
export class AdminTeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @ApiOperation({
    summary: 'Invite a staff member',
    description:
      'Minimum role: ADMIN. Creates a single-use invite (24h TTL) and emails ' +
      'an accept link. Replaces any pending invite for the same email. If the ' +
      'email fails to send, the invite stays and can be re-sent by re-inviting.',
  })
  @ApiResponse({ status: 201, type: CreateStaffInviteResponseDto })
  @ApiResponse({ status: 400, description: 'Body failed validation' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is not an admin' })
  @Post('teams/invites')
  async createInvite(
    @Body() dto: CreateStaffInviteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateStaffInviteResponseDto> {
    return this.teamsService.createInvite(dto, user.id);
  }

  @ApiOperation({
    summary: 'List staff invites',
    description:
      'Minimum role: ADMIN. Newest first. PENDING and EXPIRED are computed from expiresAt at request time. Paginated with page and limit.',
  })
  @ApiResponse({ status: 200, type: InviteListResponseDto })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is not an admin' })
  @Get('teams/invites')
  async getInvites(
    @Query() query: GetInvitesQueryDto,
  ): Promise<InviteListResponseDto> {
    return this.teamsService.getInvites(query);
  }

  @ApiOperation({
    summary: 'Revoke a pending staff invite',
    description:
      'Minimum role: ADMIN. Sets revokedAt and keeps the invite in the list.',
  })
  @ApiResponse({ status: 200, type: RevokeInviteResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is not an admin' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  @ApiResponse({
    status: 409,
    description:
      'The invite is accepted, expired or already revoked (error CONFLICT)',
  })
  @Delete('teams/invites/:id')
  async revokeInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevokeInviteResponseDto> {
    return this.teamsService.revokeInvite(id, user.id);
  }
}
