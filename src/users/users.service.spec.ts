import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Prisma, Role } from '../generated/prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma';

describe('UsersService', () => {
  let service: UsersService;
  let findUnique: jest.Mock<() => Promise<unknown>>;
  let create: jest.Mock<() => Promise<unknown>>;

  const publicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
  };

  beforeEach(async () => {
    findUnique = jest.fn<() => Promise<unknown>>();
    create = jest.fn<() => Promise<unknown>>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { user: { findUnique, create } } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('returns the user when one exists', async () => {
      findUnique.mockResolvedValue(publicUser);

      await expect(service.findById('user-1')).resolves.toEqual(publicUser);
    });

    it('queries by id', async () => {
      findUnique.mockResolvedValue(publicUser);

      await service.findById('user-1');

      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('never selects passwordHash', async () => {
      findUnique.mockResolvedValue(publicUser);

      await service.findById('user-1');

      const { select } = (findUnique.mock.calls[0] as [{ select: object }])[0];
      expect(select).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when the user is missing', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('returns the full record so auth can verify credentials', async () => {
      const withCredentials = { ...publicUser, passwordHash: 'hashed' };
      findUnique.mockResolvedValue(withCredentials);

      await expect(service.findByEmail('dev@example.com')).resolves.toEqual(
        withCredentials,
      );
      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'dev@example.com' },
      });
    });

    it('returns null when no user matches', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.findByEmail('nobody@example.com'),
      ).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('persists the user and returns it without passwordHash', async () => {
      create.mockResolvedValue(publicUser);

      const result = await service.create({
        email: 'dev@example.com',
        passwordHash: 'hashed',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email: 'dev@example.com', passwordHash: 'hashed' },
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when the email is already taken', async () => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create({ email: 'dev@example.com', passwordHash: 'hashed' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates other database errors', async () => {
      const failure = new Error('connection lost');
      create.mockRejectedValue(failure);

      await expect(
        service.create({ email: 'dev@example.com', passwordHash: 'hashed' }),
      ).rejects.toBe(failure);
    });
  });
});
