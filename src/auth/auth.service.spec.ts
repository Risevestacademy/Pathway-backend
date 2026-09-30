import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma';
import { Role } from '../generated/prisma/enums';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    updatePasswordHash: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_EXPIRY') return '15m';
      if (key === 'JWT_REFRESH_EXPIRY') return '7d';
      return 'mock-secret';
    }),
  };

  const mockPrismaService = {
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'token-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    passwordResetToken: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(mockPrismaService),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should throw ConflictException if email exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: '1' });

      await expect(
        service.register({ email: 'test@test.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user, issue tokens, and return user object with tokens', async () => {
      const mockPublicUser = {
        id: '1',
        email: 'test@test.com',
        role: Role.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockPublicUser);

      const result = await service.register({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result).toEqual({
        user: mockPublicUser,
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-token',
        },
      });
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException on wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: hashedPassword,
        role: Role.USER,
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user payload and tokens on valid credentials', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        passwordHash: hashedPassword,
        role: Role.USER,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@test.com',
        password,
      });

      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        },
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-token',
        },
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects a token whose user no longer exists with UnauthorizedException', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'deleted-user' });
      mockUsersService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.refresh('orphaned-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('propagates user lookup failures other than not-found', async () => {
      const failure = new Error('connection lost');
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockUsersService.findById.mockRejectedValue(failure);

      await expect(service.refresh('valid-refresh-token')).rejects.toBe(
        failure,
      );
    });

    it('should issue new tokens if refresh token is valid and found in DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: Role.USER,
      });

      const result = await service.refresh('valid-refresh-token');

      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should revoke the old token and issue the new one in one transaction', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: Role.USER,
      });

      await service.refresh('valid-refresh-token');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token is missing in DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: Role.USER,
      });

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('should not revoke anything when the token fails verification', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refresh('garbage')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke the token in the DB and resolve without a value', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      const result = await service.logout('valid-token');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should fail silently when JWT verification fails', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.logout('expired-token')).resolves.toBeUndefined();

      expect(mockPrismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('should surface a database failure rather than report success', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.updateMany.mockRejectedValue(
        new Error('connection terminated'),
      );

      await expect(service.logout('valid-token')).rejects.toThrow(
        'connection terminated',
      );
    });
  });

  describe('confirmPasswordReset', () => {
    const dto = { token: 'raw-reset-token', newPassword: 'NewPassword123!' };
    const expectedHash = createHash('sha256')
      .update('raw-reset-token')
      .digest('hex');

    beforeEach(() => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
      });
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({
        count: 2,
      });
      mockUsersService.updatePasswordHash.mockResolvedValue(undefined);
    });

    it('looks up an unused, unexpired token by the SHA-256 hash of the raw token', async () => {
      await service.confirmPasswordReset(dto);

      expect(
        mockPrismaService.passwordResetToken.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          tokenHash: expectedHash,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        select: { id: true, userId: true },
      });
    });

    it('marks the token used only if it is still unused', async () => {
      await service.confirmPasswordReset(dto);

      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: 'reset-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('stores a bcrypt hash of the new password through UsersService', async () => {
      await service.confirmPasswordReset(dto);

      const [userId, passwordHash, client] = mockUsersService.updatePasswordHash
        .mock.calls[0] as [string, string, unknown];

      expect(userId).toBe('user-1');
      expect(passwordHash).not.toBe(dto.newPassword);
      await expect(bcrypt.compare(dto.newPassword, passwordHash)).resolves.toBe(
        true,
      );
      expect(client).toBe(mockPrismaService);
    });

    it("revokes the user's active refresh tokens", async () => {
      await service.confirmPasswordReset(dto);

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('runs the whole reset in one transaction', async () => {
      await service.confirmPasswordReset(dto);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException and changes nothing when no valid token matches', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.confirmPasswordReset(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).not.toHaveBeenCalled();
      expect(mockUsersService.updatePasswordHash).not.toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a concurrent request used the token first', async () => {
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(service.confirmPasswordReset(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockUsersService.updatePasswordHash).not.toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
