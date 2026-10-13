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
import { NotificationService } from '../notifications';
import { Role } from '../generated/prisma/enums';
import * as bcrypt from 'bcrypt';
import { GoogleOAuthService } from './oauth/google-oauth.service';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    updatePasswordHash: jest.fn<(...args: unknown[]) => Promise<void>>(),
    toUserResponse: jest.fn(UsersService.prototype.toUserResponse),
  };

  const mockGoogleOAuthService = {
    verifyIdToken: jest.fn(),
  };

  const createdAt = new Date('2026-10-01T09:00:00.000Z');

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_EXPIRY') return '15m';
      if (key === 'JWT_REFRESH_EXPIRY') return '7d';
      if (key === 'PASSWORD_RESET_URL')
        return 'http://localhost:5173/reset-password';
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
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    emailVerificationOtp: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    user: {
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ count: 1 }),
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    authIdentity: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(mockPrismaService),
    ),
  };

  const mockNotificationService = {
    send: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.emailVerificationOtp.updateMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.emailVerificationOtp.create.mockResolvedValue({
      id: 'otp-1',
    });
    mockNotificationService.send.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: GoogleOAuthService, useValue: mockGoogleOAuthService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'test@test.com',
      password: 'password123',
      fullName: 'Ada Obi',
    };

    const createdUser = {
      id: '1',
      email: 'test@test.com',
      role: Role.USER,
      emailVerifiedAt: null,
      createdAt,
      updatedAt: createdAt,
      profile: { fullName: 'Ada Obi' },
    };

    it('throws ConflictException if the email exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: '1' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('creates an unverified user and returns an acknowledgement without tokens', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);

      const result = await service.register(dto);

      expect(result).toEqual({
        message: 'Verification code sent',
        email: 'test@test.com',
      });
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: 'test@test.com',
        passwordHash: expect.any(String),
        fullName: 'Ada Obi',
      });
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('consumes any existing OTPs, then stores a single hashed six-digit OTP', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);

      await service.register(dto);

      expect(
        mockPrismaService.emailVerificationOtp.updateMany,
      ).toHaveBeenCalledWith({
        where: { userId: '1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });

      expect(
        mockPrismaService.emailVerificationOtp.create,
      ).toHaveBeenCalledWith({
        data: {
          userId: '1',
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('emails a six-digit OTP that hashes to the stored codeHash', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);

      await service.register(dto);

      await new Promise(process.nextTick);

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'test@test.com',
        'email-verification-otp',
        expect.objectContaining({ expiresInMinutes: 15 }),
      );

      const sendArgs = mockNotificationService.send.mock.calls[0][2] as {
        otp: string;
      };
      const { data } = mockPrismaService.emailVerificationOtp.create.mock
        .calls[0][0] as { data: { codeHash: string } };

      expect(sendArgs.otp).toMatch(/^\d{6}$/);
      expect(data.codeHash).toBe(sha256(sendArgs.otp));
    });

    it('sets the OTP to expire in 15 minutes', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);

      const before = Date.now();

      await service.register(dto);

      const { data } = mockPrismaService.emailVerificationOtp.create.mock
        .calls[0][0] as { data: { expiresAt: Date } };
      const ttl = data.expiresAt.getTime() - before;

      expect(ttl).toBeGreaterThanOrEqual(15 * 60 * 1000);
      expect(ttl).toBeLessThan(15 * 60 * 1000 + 5000);
    });

    it('still resolves registration when the email fails to send', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);
      mockNotificationService.send.mockRejectedValue(new Error('mail down'));

      await expect(service.register(dto)).resolves.toBeDefined();

      await new Promise(process.nextTick);

      expect(mockNotificationService.send).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException on wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: hashedPassword,
        role: Role.USER,
        emailVerifiedAt: createdAt,
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with "Email not verified" for an unverified account', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      mockUsersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: hashedPassword,
        role: Role.USER,
        emailVerifiedAt: null,
        createdAt,
        updatedAt: createdAt,
        profile: null,
      });

      await expect(
        service.login({ email: 'test@test.com', password }),
      ).rejects.toThrow('Email not verified');

      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('returns user payload and tokens on valid credentials for a verified user', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        passwordHash: hashedPassword,
        role: Role.USER,
        emailVerifiedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        profile: null,
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
          fullName: null,
          emailVerified: true,
          createdAt,
        },
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-token',
        },
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const dto = { email: 'test@test.com', otp: '123456' };
    const expectedHash = sha256(dto.otp);

    const verifiedUser = {
      id: 'user-1',
      email: 'test@test.com',
      role: Role.USER,
      emailVerifiedAt: null,
      createdAt,
      updatedAt: createdAt,
      profile: { fullName: 'Ada Obi' },
    };

    const otpRow = {
      id: 'otp-1',
      userId: 'user-1',
      codeHash: expectedHash,
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };

    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(verifiedUser);
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue(
        otpRow,
      );
      mockPrismaService.emailVerificationOtp.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });
    });

    it('looks up the newest live OTP for the user', async () => {
      await service.verifyEmail(dto);

      expect(
        mockPrismaService.emailVerificationOtp.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('consumes the OTP and marks the user verified, then issues tokens', async () => {
      const result = await service.verifyEmail(dto);

      expect(
        mockPrismaService.emailVerificationOtp.updateMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();

      expect(result).toEqual({
        user: {
          id: 'user-1',
          email: 'test@test.com',
          role: Role.USER,
          fullName: 'Ada Obi',
          emailVerified: true,
          createdAt,
        },
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-token',
        },
      });
    });

    it('runs the whole verification in one transaction', async () => {
      await service.verifyEmail(dto);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException and changes nothing when no user matches', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user is already verified', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...verifiedUser,
        emailVerifiedAt: createdAt,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when there is no live OTP', async () => {
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and consumes the OTP when it is expired', async () => {
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        mockPrismaService.emailVerificationOtp.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('increments attempts and rejects on a wrong code', async () => {
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue({
        ...otpRow,
        codeHash: sha256('999999'),
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        mockPrismaService.emailVerificationOtp.update,
      ).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: 1 },
      });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('consumes the OTP when the final allowed attempt is used', async () => {
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue({
        ...otpRow,
        codeHash: sha256('999999'),
        attempts: 4,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        mockPrismaService.emailVerificationOtp.update,
      ).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: {
          attempts: 5,
          consumedAt: expect.any(Date),
        },
      });
    });

    it('rejects when the OTP has already hit the attempt cap', async () => {
      mockPrismaService.emailVerificationOtp.findFirst.mockResolvedValue({
        ...otpRow,
        attempts: 5,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        mockPrismaService.emailVerificationOtp.update,
      ).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    const unverifiedUser = {
      id: 'user-1',
      email: 'dev@example.com',
      emailVerifiedAt: null,
    };

    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(unverifiedUser);
    });

    it('does nothing for an unknown email and still resolves', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.resendVerificationEmail({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('does nothing for an already-verified email and still resolves', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...unverifiedUser,
        emailVerifiedAt: createdAt,
      });

      await expect(
        service.resendVerificationEmail({ email: unverifiedUser.email }),
      ).resolves.toBeUndefined();

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('consumes previous OTPs and stores a new hashed one in a single transaction', async () => {
      await service.resendVerificationEmail({ email: unverifiedUser.email });

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(
        mockPrismaService.emailVerificationOtp.updateMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(
        mockPrismaService.emailVerificationOtp.create,
      ).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('emails a new six-digit OTP that hashes to the stored codeHash', async () => {
      await service.resendVerificationEmail({ email: unverifiedUser.email });

      await new Promise(process.nextTick);

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'dev@example.com',
        'email-verification-otp',
        expect.objectContaining({ expiresInMinutes: 15 }),
      );

      const sendArgs = mockNotificationService.send.mock.calls[0][2] as {
        otp: string;
      };
      const { data } = mockPrismaService.emailVerificationOtp.create.mock
        .calls[0][0] as { data: { codeHash: string } };

      expect(sendArgs.otp).toMatch(/^\d{6}$/);
      expect(data.codeHash).toBe(sha256(sendArgs.otp));
    });

    it('still resolves when the email fails to send', async () => {
      mockNotificationService.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.resendVerificationEmail({ email: unverifiedUser.email }),
      ).resolves.toBeUndefined();

      await new Promise(process.nextTick);

      expect(mockNotificationService.send).toHaveBeenCalled();
    });
  });

  describe('findCurrentUser', () => {
    it('returns the shared user shape loaded from the database', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: Role.ADMIN,
        emailVerifiedAt: null,
        createdAt,
        updatedAt: createdAt,
        profile: { fullName: 'Ada Obi' },
      });

      await expect(service.findCurrentUser('user-1')).resolves.toEqual({
        id: 'user-1',
        email: 'test@test.com',
        role: Role.ADMIN,
        fullName: 'Ada Obi',
        emailVerified: false,
        createdAt,
      });
      expect(mockUsersService.findById).toHaveBeenCalledWith('user-1');
    });

    it('rejects with UnauthorizedException when the user no longer exists', async () => {
      mockUsersService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.findCurrentUser('deleted-user')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates user lookup failures other than not-found', async () => {
      const failure = new Error('connection lost');
      mockUsersService.findById.mockRejectedValue(failure);

      await expect(service.findCurrentUser('user-1')).rejects.toBe(failure);
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

  describe('requestPasswordReset', () => {
    const user = {
      id: 'user-1',
      email: 'dev@example.com',
      passwordHash: 'hash',
      role: Role.USER,
    };

    const sentData = () =>
      mockNotificationService.send.mock.calls[0][2] as {
        resetUrl: string;
        expiresInMinutes: number;
      };

    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockPrismaService.passwordResetToken.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({
        id: 'reset-1',
      });
      mockNotificationService.send.mockResolvedValue(undefined);
    });

    it('does nothing for an unknown email and still resolves', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it("deletes the user's unused reset tokens and stores a new one in one transaction", async () => {
      await service.requestPasswordReset({ email: user.email });

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(
        mockPrismaService.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
      });
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('sets the token to expire in 60 minutes', async () => {
      const before = Date.now();

      await service.requestPasswordReset({ email: user.email });

      const { data } = mockPrismaService.passwordResetToken.create.mock
        .calls[0][0] as { data: { expiresAt: Date } };
      const ttl = data.expiresAt.getTime() - before;

      expect(ttl).toBeGreaterThanOrEqual(60 * 60 * 1000);
      expect(ttl).toBeLessThan(60 * 60 * 1000 + 5000);
    });

    it('emails a reset link whose token hashes to the stored hash', async () => {
      await service.requestPasswordReset({ email: user.email });

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'dev@example.com',
        'password-reset',
        expect.objectContaining({ expiresInMinutes: 60 }),
      );

      const resetUrl = new URL(sentData().resetUrl);
      const token = resetUrl.searchParams.get('token')!;
      const { data } = mockPrismaService.passwordResetToken.create.mock
        .calls[0][0] as { data: { tokenHash: string } };

      expect(resetUrl.origin + resetUrl.pathname).toBe(
        'http://localhost:5173/reset-password',
      );
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(data.tokenHash).not.toBe(token);
      expect(data.tokenHash).toBe(sha256(token));
    });

    it('still resolves when the email fails to send', async () => {
      mockNotificationService.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.requestPasswordReset({ email: user.email }),
      ).resolves.toBeUndefined();

      await new Promise(process.nextTick);

      expect(mockNotificationService.send).toHaveBeenCalled();
    });
  });

  describe('confirmPasswordReset', () => {
    const dto = { token: 'raw-reset-token', newPassword: 'NewPassword123!' };
    const expectedHash = sha256('raw-reset-token');

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

    it('also verifies the email, since the user has proven inbox ownership', async () => {
      await service.confirmPasswordReset(dto);

      expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', emailVerifiedAt: null },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('does not touch user.updateMany when no valid reset token matches', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.confirmPasswordReset(dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrismaService.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('googleLogin', () => {
    const validIdToken = 'valid-google-id-token';
    const googleProfile = {
      googleId: 'google-sub-123',
      email: 'test@test.com',
      emailVerified: true,
      fullName: 'Ada Obi',
      picture: 'https://example.com/pic.jpg',
    };

    beforeEach(() => {
      mockGoogleOAuthService.verifyIdToken.mockResolvedValue(googleProfile);
    });

    it('should throw UnauthorizedException on invalid, expired, or wrong-audience token', async () => {
      mockGoogleOAuthService.verifyIdToken.mockRejectedValue(
        new UnauthorizedException('Invalid Google ID token'),
      );

      await expect(service.googleLogin('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when email_verified is false', async () => {
      mockGoogleOAuthService.verifyIdToken.mockRejectedValue(
        new UnauthorizedException('Google account must have a verified email'),
      );

      await expect(service.googleLogin(validIdToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should sign in the linked user when a Google identity already exists', async () => {
      const mockIdentity = {
        provider: 'GOOGLE',
        providerUserId: googleProfile.googleId,
        user: {
          id: 'user-1',
          email: 'test@test.com',
          role: Role.USER,
          emailVerifiedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
          profile: { fullName: 'Ada Obi' },
        },
      };

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(mockIdentity);

      const result = await service.googleLogin(validIdToken);

      expect(result).toEqual({
        user: {
          id: 'user-1',
          email: 'test@test.com',
          role: Role.USER,
          fullName: 'Ada Obi',
          emailVerified: true,
          createdAt,
        },
        tokens: {
          accessToken: 'mock-token',
          refreshToken: 'mock-token',
        },
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('takes over an unverified local account and drops its pending OTPs', async () => {
      const existingUnverifiedUser = {
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: 'hashed-local-password',
        emailVerifiedAt: null,
      };

      const updatedUser = {
        ...existingUnverifiedUser,
        passwordHash: null,
        emailVerifiedAt: new Date(),
        profile: { fullName: 'Ada Obi' },
      };

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(existingUnverifiedUser);
      mockPrismaService.user.findUniqueOrThrow = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(updatedUser);

      await service.googleLogin(validIdToken);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: existingUnverifiedUser.id },
        data: {
          passwordHash: null,
          emailVerifiedAt: expect.any(Date),
        },
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: existingUnverifiedUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(
        mockPrismaService.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: existingUnverifiedUser.id, usedAt: null },
      });
      expect(
        mockPrismaService.emailVerificationOtp.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: existingUnverifiedUser.id, consumedAt: null },
      });
      expect(mockPrismaService.authIdentity.create).toHaveBeenCalled();
    });

    it('should create user, profile, and identity for a new Google user', async () => {
      const newUser = {
        id: 'new-user-1',
        email: 'test@test.com',
        role: Role.USER,
        emailVerifiedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        profile: { fullName: 'Ada Obi' },
      };

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(null);
      mockPrismaService.user.create = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(newUser);

      const result = await service.googleLogin(validIdToken);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@test.com',
          passwordHash: null,
          emailVerifiedAt: expect.any(Date),
          profile: {
            create: {
              fullName: 'Ada Obi',
            },
          },
          identities: {
            create: {
              provider: 'GOOGLE',
              providerUserId: googleProfile.googleId,
            },
          },
        },
        include: { profile: true },
      });
      expect(result.user).toBeDefined();
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if the database uniqueness constraint (P2002) is triggered', async () => {
      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(null);
      mockPrismaService.user.create = jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockRejectedValue({ code: 'P2002' });

      await expect(service.googleLogin(validIdToken)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
