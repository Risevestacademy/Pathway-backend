import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Role } from '../generated/prisma/client';
import { UsersController } from './users.controller';
import { PublicUser, UserResponse, UsersService } from './users.service';
import type { AuthenticatedUser } from '../common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const user: PublicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    emailVerifiedAt: null,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    profile: null,
  };

  const mockService = {
    findById: jest.fn<() => Promise<PublicUser>>(),
    updateProfile: jest.fn<() => Promise<UserResponse>>(),
  };

  beforeEach(async () => {
    mockService.findById.mockReset();
    mockService.updateProfile.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('findOne calls service.findById with the given id', async () => {
    mockService.findById.mockResolvedValue(user);

    const result = await controller.findOne('user-1');

    expect(service.findById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(user);
  });

  it('updateMe updates the profile of the authenticated user', async () => {
    const updated: UserResponse = {
      id: 'user-1',
      email: 'dev@example.com',
      role: Role.USER,
      fullName: 'Ada Obi',
      emailVerified: false,
      createdAt: user.createdAt,
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
