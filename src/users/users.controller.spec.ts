import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Role } from '../generated/prisma/client';
import { UsersController } from './users.controller';
import { UserResponse, UsersService } from './users.service';
import type { AuthenticatedUser } from '../common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockService = {
    updateProfile: jest.fn<() => Promise<UserResponse>>(),
  };

  beforeEach(async () => {
    mockService.updateProfile.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('updateMe updates the profile of the authenticated user', async () => {
    const updated: UserResponse = {
      id: 'user-1',
      email: 'dev@example.com',
      role: Role.USER,
      fullName: 'Ada Obi',
      emailVerified: false,
      createdAt: new Date('2026-09-18T10:00:00.000Z'),
    };
    mockService.updateProfile.mockResolvedValue(updated);

    const result = await controller.updateMe(
      {
        id: 'user-1',
        email: 'dev@example.com',
        role: Role.USER,
      } as AuthenticatedUser,
      { fullName: 'Ada Obi' },
    );

    expect(service.updateProfile).toHaveBeenCalledWith('user-1', {
      fullName: 'Ada Obi',
    });
    expect(result).toEqual(updated);
  });
});
