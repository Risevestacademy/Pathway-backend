import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../generated/prisma/client';
import { UsersController } from './users.controller';
import { UserResponse, UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersController', () => {
  let controller: UsersController;
  const updateProfile =
    jest.fn<(id: string, dto: UpdateUserDto) => Promise<UserResponse>>();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: { updateProfile } }],
    }).compile();

    controller = module.get(UsersController);
  });

  it('delegates PATCH /users/me to updateProfile with the caller’s id', async () => {
    const response = { id: 'user-1' } as UserResponse;
    updateProfile.mockResolvedValue(response);
    const dto: UpdateUserDto = { analyticsEnabled: false };

    await expect(
      controller.updateMe(
        { id: 'user-1', email: 'dev@example.com', role: Role.USER },
        dto,
      ),
    ).resolves.toBe(response);
    expect(updateProfile).toHaveBeenCalledWith('user-1', dto);
  });
});
