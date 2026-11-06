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
  let upsertProfile: jest.Mock<() => Promise<unknown>>;

  const publicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    emailVerifiedAt: null,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    profile: { firstName: 'Ada', lastName: 'Obi' },
  };

  beforeEach(async () => {
    findUnique = jest.fn<() => Promise<unknown>>();
    create = jest.fn<() => Promise<unknown>>();
    update = jest.fn<() => Promise<unknown>>();
    upsertProfile = jest.fn<() => Promise<unknown>>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique, create, update },
            userProfile: { upsert: upsertProfile },
          },
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

    it('selects the verification timestamp and profile names', async () => {
      findUnique.mockResolvedValue(publicUser);
      await service.findById('user-1');
      const { select } = (findUnique.mock.calls[0] as [{ select: object }])[0];
      expect(select).toMatchObject({
        emailVerifiedAt: true,
        profile: {
          select: { firstName: true, lastName: true },
        },
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
        include: {
          profile: {
            select: { firstName: true, lastName: true },
          },
        },
      });
    });

    it('lowercases the email before querying', async () => {
      findUnique.mockResolvedValue(null);
      await service.findByEmail('Dev@Example.COM');
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'dev@example.com' } }),
      );
    });

    it('returns null when no user matches', async () => {
      findUnique.mockResolvedValue(null);
      await expect(
        service.findByEmail('nobody@example.com'),
      ).resolves.toBeNull();
    });
  });

  describe('create', () => {
    const newUser = {
      email: 'dev@example.com',
      passwordHash: 'hashed',
      firstName: 'Ada',
      lastName: 'Obi',
    };

    it('persists the user with its profile in one nested write and returns it without passwordHash', async () => {
      create.mockResolvedValue(publicUser);

      const result = await service.create(newUser);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            email: 'dev@example.com',
            passwordHash: 'hashed',
            profile: { create: { firstName: 'Ada', lastName: 'Obi' } },
          },
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

      await expect(service.create(newUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propagates other database errors', async () => {
      const failure = new Error('connection lost');
      create.mockRejectedValue(failure);

      await expect(service.create(newUser)).rejects.toBe(failure);
    });
  });

  describe('updateProfile', () => {
    const dto = { firstName: 'Ada', lastName: 'Obi' };

    it('upserts the profile by user id and returns the shared user shape', async () => {
      upsertProfile.mockResolvedValue({});
      findUnique.mockResolvedValue(publicUser);

      const result = await service.updateProfile('user-1', dto);

      expect(upsertProfile).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', firstName: 'Ada', lastName: 'Obi' },
        update: { firstName: 'Ada', lastName: 'Obi' },
      });
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result).toEqual({
        id: 'user-1',
        email: 'dev@example.com',
        role: Role.USER,
        firstName: 'Ada',
        lastName: 'Obi',
        fullName: 'Ada Obi',
        emailVerified: false,
        createdAt: publicUser.createdAt,
      });
    });

    it('trims whitespace and nulls out an empty lastName', async () => {
      upsertProfile.mockResolvedValue({});
      findUnique.mockResolvedValue(publicUser);

      await service.updateProfile('user-1', {
        firstName: '  Ada  ',
        lastName: '   ',
      });

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { firstName: 'Ada', lastName: null },
        }),
      );
    });

    it('throws ConflictException when firstName is missing', async () => {
      await expect(
        service.updateProfile('user-1', { lastName: 'Obi' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(upsertProfile).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      upsertProfile.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint violated',
          { code: 'P2003', clientVersion: 'test' },
        ),
      );

      await expect(
        service.updateProfile('missing', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is deleted before the read', async () => {
      upsertProfile.mockResolvedValue({});
      findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('user-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propagates other database errors', async () => {
      const failure = new Error('connection lost');
      upsertProfile.mockRejectedValue(failure);

      await expect(service.updateProfile('user-1', dto)).rejects.toBe(failure);
    });
  });

  describe('toUserResponse', () => {
    it('maps a user to the shared response shape', () => {
      expect(service.toUserResponse(publicUser)).toEqual({
        id: 'user-1',
        email: 'dev@example.com',
        role: Role.USER,
        firstName: 'Ada',
        lastName: 'Obi',
        fullName: 'Ada Obi',
        emailVerified: false,
        createdAt: publicUser.createdAt,
      });
    });

    it('derives fullName from firstName and lastName', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: { firstName: 'Ada', lastName: 'Obi' },
      });
      expect(result.fullName).toBe('Ada Obi');
    });

    it('uses a lone firstName as the fullName', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: { firstName: 'Madonna', lastName: null },
      });
      expect(result.fullName).toBe('Madonna');
    });

    it('returns a null fullName when both names are missing', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: { firstName: null, lastName: null },
      });
      expect(result.fullName).toBeNull();
    });

    it('reports a user with a verification timestamp as verified', () => {
      const result = service.toUserResponse({
        ...publicUser,
        emailVerifiedAt: new Date('2026-09-19T10:00:00.000Z'),
      });
      expect(result.emailVerified).toBe(true);
    });

    it('returns null names when the user has no profile', () => {
      const result = service.toUserResponse({ ...publicUser, profile: null });
      expect(result).toMatchObject({
        firstName: null,
        lastName: null,
        fullName: null,
      });
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
        'firstName',
        'fullName',
        'id',
        'lastName',
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

  describe('updateRole', () => {
    it('updates only the role and returns the public user', async () => {
      update.mockResolvedValue({ ...publicUser, role: Role.EDITOR });

      const result = await service.updateRole('user-1', Role.EDITOR);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.EDITOR },
        select: expect.objectContaining({
          id: true,
          email: true,
          role: true,
          emailVerifiedAt: true,
        }) as object,
      });
      expect(result).toEqual({ ...publicUser, role: Role.EDITOR });
    });

    it('uses the client it is given so callers can run it in a transaction', async () => {
      const txUpdate = jest.fn<() => Promise<unknown>>();
      txUpdate.mockResolvedValue(publicUser);
      const tx = { user: { update: txUpdate } } as unknown as Pick<
        PrismaService,
        'user'
      >;

      await service.updateRole('user-1', Role.EDITOR, tx);

      expect(txUpdate).toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
