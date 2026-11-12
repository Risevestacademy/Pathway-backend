import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { AnalyticsService } from '../analytics';
import { DomainException } from '../common';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
  Prisma,
  Role,
  TargetLevel,
} from '../generated/prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma';

describe('UsersService', () => {
  let service: UsersService;
  let findUnique: jest.Mock<() => Promise<unknown>>;
  let create: jest.Mock<() => Promise<unknown>>;
  let update: jest.Mock<() => Promise<unknown>>;
  let upsertProfile: jest.Mock<(args: unknown) => Promise<unknown>>;
  let updateManyUser: jest.Mock<(args: unknown) => Promise<{ count: number }>>;
  let findManyFields: jest.Mock<(args: unknown) => Promise<{ slug: string }[]>>;
  let invalidateUser: jest.Mock<(userId: string) => void>;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const CLOUD_NAME = 'test-cloud';
  const ALLOWED_HOST = 'res.cloudinary.com';
  const avatarFor = (userId: string) =>
    `https://${ALLOWED_HOST}/${CLOUD_NAME}/image/upload/v1/avatars/${userId}/photo.jpg`;

  const emptyProfile = {
    avatarUrl: null,
    careerStage: null,
    educationLevel: null,
    internshipCount: null,
    experienceYears: null,
    learningGoals: [],
    weeklyTimeCommitment: null,
    careerInterests: [],
  };

  const publicUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    emailVerifiedAt: null,
    analyticsEnabled: true,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    profile: { firstName: 'Ada', lastName: 'Obi', ...emptyProfile },
  };

  const sharedShape = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
    firstName: 'Ada',
    lastName: 'Obi',
    fullName: 'Ada Obi',
    emailVerified: false,
    createdAt: publicUser.createdAt,
    ...emptyProfile,
    analyticsEnabled: true,
  };

  beforeEach(async () => {
    findUnique = jest.fn<() => Promise<unknown>>();
    create = jest.fn<() => Promise<unknown>>();
    update = jest.fn<() => Promise<unknown>>();
    upsertProfile = jest.fn<(args: unknown) => Promise<unknown>>();
    updateManyUser = jest.fn<(args: unknown) => Promise<{ count: number }>>();
    findManyFields = jest.fn<(args: unknown) => Promise<{ slug: string }[]>>();
    invalidateUser = jest.fn<(userId: string) => void>();

    upsertProfile.mockResolvedValue({});
    updateManyUser.mockResolvedValue({ count: 0 });
    findManyFields.mockResolvedValue([]);
    findUnique.mockResolvedValue(publicUser);

    const tx = {
      userProfile: { upsert: upsertProfile },
      user: { updateMany: updateManyUser },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique, create, update },
            userProfile: { upsert: upsertProfile },
            field: { findMany: findManyFields },
            $transaction: jest.fn(
              (callback: (client: typeof tx) => Promise<unknown>) =>
                callback(tx),
            ),
          },
        },
        { provide: AnalyticsService, useValue: { invalidateUser } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'CLOUDINARY_CLOUD_NAME') return CLOUD_NAME;
              if (key === 'CLOUDINARY_ALLOWED_HOST') return ALLOWED_HOST;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('findById', () => {
    it('returns the user when one exists', async () => {
      await expect(service.findById('user-1')).resolves.toEqual(publicUser);
    });

    it('queries by id', async () => {
      await service.findById('user-1');
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('never selects passwordHash', async () => {
      await service.findById('user-1');
      const { select } = (findUnique.mock.calls[0] as [{ select: object }])[0];
      expect(select).not.toHaveProperty('passwordHash');
    });

    it('selects the verification timestamp, analytics flag and profile fields', async () => {
      await service.findById('user-1');
      const { select } = (findUnique.mock.calls[0] as [{ select: object }])[0];
      expect(select).toMatchObject({
        emailVerifiedAt: true,
        analyticsEnabled: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            careerStage: true,
            educationLevel: true,
            internshipCount: true,
            experienceYears: true,
            learningGoals: true,
            weeklyTimeCommitment: true,
            careerInterests: true,
          },
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
            select: expect.objectContaining({
              firstName: true,
              lastName: true,
            }) as object,
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
      const result = await service.updateProfile('user-1', dto);

      expect(upsertProfile).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', firstName: 'Ada', lastName: 'Obi' },
        update: { firstName: 'Ada', lastName: 'Obi' },
      });
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result).toEqual(sharedShape);
    });

    it('writes every onboarding field that is sent', async () => {
      findManyFields.mockResolvedValue([{ slug: 'design' }]);

      await service.updateProfile('user-1', {
        avatarUrl: avatarFor('user-1'),
        careerStage: TargetLevel.RECENT_GRAD,
        educationLevel: EducationLevel.BACHELOR,
        internshipCount: InternshipCount.TWO,
        experienceYears: ExperienceYears.ONE_TO_TWO,
        learningGoals: ['Land an internship'],
        weeklyTimeCommitment: '5-10 hours',
        careerInterests: ['design'],
      });

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            avatarUrl: avatarFor('user-1'),
            careerStage: TargetLevel.RECENT_GRAD,
            educationLevel: EducationLevel.BACHELOR,
            internshipCount: InternshipCount.TWO,
            experienceYears: ExperienceYears.ONE_TO_TWO,
            learningGoals: ['Land an internship'],
            weeklyTimeCommitment: '5-10 hours',
            careerInterests: ['design'],
          },
        }),
      );
    });

    it('leaves omitted fields untouched', async () => {
      await service.updateProfile('user-1', {
        educationLevel: EducationLevel.MASTERS,
      });

      expect(upsertProfile).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', educationLevel: EducationLevel.MASTERS },
        update: { educationLevel: EducationLevel.MASTERS },
      });
      expect(updateManyUser).not.toHaveBeenCalled();
    });

    it('clears fields sent as null, storing empty lists for list fields', async () => {
      await service.updateProfile('user-1', {
        lastName: null,
        avatarUrl: null,
        careerStage: null,
        educationLevel: null,
        internshipCount: null,
        experienceYears: null,
        learningGoals: null,
        weeklyTimeCommitment: null,
        careerInterests: null,
      });

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            lastName: null,
            avatarUrl: null,
            careerStage: null,
            educationLevel: null,
            internshipCount: null,
            experienceYears: null,
            learningGoals: [],
            weeklyTimeCommitment: null,
            careerInterests: [],
          },
        }),
      );
      expect(findManyFields).not.toHaveBeenCalled();
    });

    it('accepts known field slugs as career interests', async () => {
      findManyFields.mockResolvedValue([
        { slug: 'design' },
        { slug: 'data-analytics' },
      ]);

      await service.updateProfile('user-1', {
        careerInterests: ['design', 'data-analytics'],
      });

      expect(findManyFields).toHaveBeenCalledWith({
        where: { slug: { in: ['design', 'data-analytics'] } },
        select: { slug: true },
      });
      expect(upsertProfile).toHaveBeenCalled();
    });

    it('rejects unknown field slugs with 400 and writes nothing', async () => {
      findManyFields.mockResolvedValue([{ slug: 'design' }]);

      const error = await service
        .updateProfile('user-1', { careerInterests: ['design', 'astrology'] })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({
        code: 'UNKNOWN_CAREER_INTEREST',
        details: { slugs: ['astrology'] },
      });
      expect((error as DomainException).getStatus()).toBe(400);
      expect(upsertProfile).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        { userId: 'user-1', reason: 'UNKNOWN_CAREER_INTEREST' },
        'Profile update rejected',
      );
    });

    it('accepts an avatar URL in the user’s own folder', async () => {
      await service.updateProfile('user-1', { avatarUrl: avatarFor('user-1') });

      expect(upsertProfile).toHaveBeenCalled();
    });

    it.each([
      ['another user’s folder', avatarFor('user-2')],
      [
        'another host',
        'https://evil.example.com/test-cloud/image/upload/v1/avatars/user-1/a.jpg',
      ],
      ['http', avatarFor('user-1').replace('https', 'http')],
    ])(
      'rejects an avatar URL from %s with 400 and writes nothing',
      async (_label, avatarUrl) => {
        const error = await service
          .updateProfile('user-1', { avatarUrl })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainException);
        expect(error).toMatchObject({ code: 'INVALID_AVATAR_URL' });
        expect(upsertProfile).not.toHaveBeenCalled();
      },
    );

    it('invalidates the analytics cache when the flag changes', async () => {
      updateManyUser.mockResolvedValue({ count: 1 });

      await service.updateProfile('user-1', { analyticsEnabled: false });

      expect(updateManyUser).toHaveBeenCalledWith({
        where: { id: 'user-1', analyticsEnabled: { not: false } },
        data: { analyticsEnabled: false },
      });
      expect(invalidateUser).toHaveBeenCalledWith('user-1');
    });

    it('does not invalidate the cache when the flag is unchanged', async () => {
      updateManyUser.mockResolvedValue({ count: 0 });

      await service.updateProfile('user-1', { analyticsEnabled: true });

      expect(invalidateUser).not.toHaveBeenCalled();
    });

    it('does not invalidate the cache when the flag is not sent', async () => {
      await service.updateProfile('user-1', dto);

      expect(updateManyUser).not.toHaveBeenCalled();
      expect(invalidateUser).not.toHaveBeenCalled();
    });

    it('logs the names of the sent fields, never their values', async () => {
      await service.updateProfile('user-1', {
        firstName: 'Ada',
        analyticsEnabled: false,
      });

      expect(logSpy).toHaveBeenCalledWith(
        { userId: 'user-1', fields: ['firstName', 'analyticsEnabled'] },
        'Profile updated',
      );
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
      expect(invalidateUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is deleted before the read', async () => {
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
      expect(service.toUserResponse(publicUser)).toEqual(sharedShape);
    });

    it('maps the stored profile fields', () => {
      const result = service.toUserResponse({
        ...publicUser,
        analyticsEnabled: false,
        profile: {
          ...publicUser.profile,
          careerStage: TargetLevel.STUDENT,
          learningGoals: ['Ship a portfolio'],
          careerInterests: ['design'],
        },
      });

      expect(result).toMatchObject({
        careerStage: TargetLevel.STUDENT,
        learningGoals: ['Ship a portfolio'],
        careerInterests: ['design'],
        analyticsEnabled: false,
      });
    });

    it('derives fullName from firstName and lastName', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: { ...publicUser.profile, firstName: 'Ada', lastName: 'Obi' },
      });
      expect(result.fullName).toBe('Ada Obi');
    });

    it('uses a lone firstName as the fullName', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: {
          ...publicUser.profile,
          firstName: 'Madonna',
          lastName: null,
        },
      });
      expect(result.fullName).toBe('Madonna');
    });

    it('returns a null fullName when both names are missing', () => {
      const result = service.toUserResponse({
        ...publicUser,
        profile: { ...publicUser.profile, firstName: null, lastName: null },
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

    it('returns nulls and empty lists when the user has no profile', () => {
      const result = service.toUserResponse({ ...publicUser, profile: null });
      expect(result).toMatchObject({
        firstName: null,
        lastName: null,
        fullName: null,
        ...emptyProfile,
      });
    });

    it('never exposes credentials or raw timestamps', () => {
      const result = service.toUserResponse({
        ...publicUser,
        passwordHash: 'hashed',
      } as typeof publicUser);

      expect(Object.keys(result).sort()).toEqual([
        'analyticsEnabled',
        'avatarUrl',
        'careerInterests',
        'careerStage',
        'createdAt',
        'educationLevel',
        'email',
        'emailVerified',
        'experienceYears',
        'firstName',
        'fullName',
        'id',
        'internshipCount',
        'lastName',
        'learningGoals',
        'role',
        'weeklyTimeCommitment',
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
