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
  let update: jest.Mock<() => Promise<unknown>>;

  const publicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    emailVerifiedAt: null,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    profile: { fullName: 'Ada Obi' },
  };

  beforeEach(async () => {
    findUnique = jest.fn<() => Promise<unknown>>();
    create = jest.fn<() => Promise<unknown>>();
    update = jest.fn<() => Promise<unknown>>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: { user: { findUnique, create, update } },
        },
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

    it('selects the verification timestamp and profile name', async () => {
      findUnique.mockResolvedValue(publicUser);

      await service.findById('user-1');

      const { select } = (findUnique.mock.calls[0] as [{ select: object }])[0];
      expect(select).toMatchObject({
        emailVerifiedAt: true,
        profile: { select: { fullName: true } },
      });
    });

    it('throws NotFoundException when the user is missing', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('returns the full record with the profile so auth can verify credentials', async () => {
      const withCredentials = { ...publicUser, passwordHash: 'hashed' };
      findUnique.mockResolvedValue(withCredentials);

      await expect(service.findByEmail('dev@example.com')).resolves.toEqual(
        withCredentials,
      );
      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'dev@example.com' },
        include: { profile: { select: { fullName: true } } },
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

  describe('toUserResponse', () => {
    it('maps a user to the shared response shape', () => {
      expect(service.toUserResponse(publicUser)).toEqual({
        id: 'user-1',
        email: 'dev@example.com',
        role: Role.USER,
        fullName: 'Ada Obi',
        emailVerified: false,
        createdAt: publicUser.createdAt,
      });
    });

    it('reports a user with a verification timestamp as verified', () => {
      const result = service.toUserResponse({
        ...publicUser,
        emailVerifiedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

      expect(result.emailVerified).toBe(true);
    });

    it('returns a null fullName when the user has no profile', () => {
      const result = service.toUserResponse({ ...publicUser, profile: null });

      expect(result.fullName).toBeNull();
    });

    it('never exposes credentials or raw timestamps', () => {
      const result = service.toUserResponse({
        ...publicUser,
        passwordHash: 'hashed',
      } as typeof publicUser);

      expect(Object.keys(result).sort()).toEqual([
        'createdAt',
        'email',
        'emailVerified',
        'fullName',
        'id',
        'role',
      ]);
    });
  });

  describe('updatePasswordHash', () => {
    it('updates only the password hash of the given user', async () => {
      update.mockResolvedValue(publicUser);

      await expect(
        service.updatePasswordHash('user-1', 'new-hash'),
      ).resolves.toBeUndefined();

      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hash' },
      });
    });

    it('uses the client it is given so callers can run it in a transaction', async () => {
      const txUpdate = jest.fn<() => Promise<unknown>>();
      txUpdate.mockResolvedValue(publicUser);
      const tx = { user: { update: txUpdate } } as unknown as Pick<
        PrismaService,
        'user'
      >;

      await service.updatePasswordHash('user-1', 'new-hash', tx);

      expect(txUpdate).toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
