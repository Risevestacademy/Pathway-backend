import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../common';
import { AdminTeamsController } from './admin.controller';
import { TeamsService } from './teams.service';
import type { GetInvitesQueryDto } from './dto/get-invites-query.dto';
import type { InviteListResponseDto } from './dto/invite-list-response.dto';
import type { RevokeInviteResponseDto } from './dto/revoke-invite-response.dto';

describe('AdminTeamsController', () => {
  let controller: AdminTeamsController;

  const mockTeamsService = {
    getInvites:
      jest.fn<(query: GetInvitesQueryDto) => Promise<InviteListResponseDto>>(),
    revokeInvite:
      jest.fn<
        (id: string, adminId: string) => Promise<RevokeInviteResponseDto>
      >(),
  };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTeamsController],
      providers: [{ provide: TeamsService, useValue: mockTeamsService }],
    }).compile();

    controller = module.get<AdminTeamsController>(AdminTeamsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInvites', () => {
    it('should pass the query to teamsService.getInvites and return its result', async () => {
      const query: GetInvitesQueryDto = {
        status: 'PENDING',
        page: 2,
        limit: 5,
      };
      const list: InviteListResponseDto = {
        items: [],
        total: 6,
        page: 2,
        limit: 5,
      };
      mockTeamsService.getInvites.mockResolvedValue(list);

      const result = await controller.getInvites(query);

      expect(mockTeamsService.getInvites).toHaveBeenCalledWith(query);
      expect(result).toEqual(list);
    });
  });

  describe('revokeInvite', () => {
    it("should pass the id and the admin's id to teamsService.revokeInvite and return its result", async () => {
      mockTeamsService.revokeInvite.mockResolvedValue({
        message: 'Invite revoked',
      });

      const result = await controller.revokeInvite('invite-1', admin);

      expect(mockTeamsService.revokeInvite).toHaveBeenCalledWith(
        'invite-1',
        'admin-1',
      );
      expect(result).toEqual({ message: 'Invite revoked' });
    });
  });
});
