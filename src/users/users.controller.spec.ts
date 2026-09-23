import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Role } from '../generated/prisma/client';
import { UsersController } from './users.controller';
import { PublicUser, UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const user: PublicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
  };

  const mockService = {
    findById: jest.fn<() => Promise<PublicUser>>(),
  };

  beforeEach(async () => {
    mockService.findById.mockReset();

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
});
