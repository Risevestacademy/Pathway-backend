import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Role } from '../generated/prisma/enums';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
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

    it('should create user and return user object', async () => {
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

      expect(result).toEqual(mockPublicUser);
      expect(mockUsersService.create).toHaveBeenCalled();
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

    it('should return tokens on valid credentials', async () => {
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
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should issue new tokens if refresh token is valid and found in DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
      });
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
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token is missing in DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should revoke token in DB and return success message', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      const result = await service.logout('valid-token');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should fail silently and return success message if JWT verification fails', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      const result = await service.logout('expired-token');

      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
