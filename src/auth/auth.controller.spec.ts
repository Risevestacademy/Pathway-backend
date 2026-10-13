import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService, AuthResult } from './auth.service';
import { LoginDto, RegisterDto, GoogleAuthDto, VerifyEmailDto } from './dto';
import type { AuthenticatedUser } from '../common';
import type { UserResponse } from '../users';

type LoginRequest = Parameters<AuthController['login']>[1];
type RefreshRequest = Parameters<AuthController['refresh']>[0];
type LogoutRequest = Parameters<AuthController['logout']>[0];
type GoogleRequest = Parameters<AuthController['google']>[1];
type VerifyEmailRequest = Parameters<AuthController['verifyEmail']>[1];

const requestWith = (platform?: string, cookies: object = {}) => ({
  get: () => platform,
  cookies,
});

describe('AuthController', () => {
  let controller: AuthController;

  const cookiePath = '/api/v1/auth';

  const mockUser: UserResponse = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'dev@example.com',
    role: 'USER',
    fullName: 'Ada Obi',
    emailVerified: true,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
  };

  const mockAuthService = {
    register: jest.fn<() => Promise<{ message: string; email: string }>>(),
    login: jest.fn<() => Promise<AuthResult>>(),
    verifyEmail: jest.fn<() => Promise<AuthResult>>(),
    resendVerificationEmail: jest.fn<() => Promise<void>>(),
    googleLogin: jest.fn<() => Promise<AuthResult>>(),
    refresh:
      jest.fn<() => Promise<{ accessToken: string; refreshToken: string }>>(),
    logout: jest.fn<() => Promise<void>>(),
    confirmPasswordReset: jest.fn<() => Promise<void>>(),
    requestPasswordReset: jest.fn<() => Promise<void>>(),
    findCurrentUser: jest.fn<() => Promise<UserResponse>>(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'API_VERSION') return 'v1';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'JWT_REFRESH_EXPIRY') return '30d';
      return undefined;
    }),
  };

  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'dev@example.com',
      password: 'Password123!',
      fullName: 'Ada Obi',
    };

    it('delegates registration to AuthService and returns the acknowledgement body', async () => {
      mockAuthService.register.mockResolvedValue({
        message: 'Verification code sent',
        email: 'dev@example.com',
      });

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual({
        message: 'Verification code sent',
        email: 'dev@example.com',
      });
    });

    it('does not issue tokens or set a cookie at registration', async () => {
      mockAuthService.register.mockResolvedValue({
        message: 'Verification code sent',
        email: 'dev@example.com',
      });

      const result = (await controller.register(registerDto)) as unknown as {
        accessToken?: string;
        refreshToken?: string;
      };

      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'dev@example.com',
      password: 'Password123!',
    };

    it('scopes the refresh token cookie to the versioned auth base path', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      await controller.login(
        loginDto,
        requestWith() as unknown as LoginRequest,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({ path: cookiePath }),
      );
    });

    it('withholds the refresh token from a web login body and includes user payload', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.login(
        loginDto,
        requestWith() as unknown as LoginRequest,
        mockResponse as unknown as Response,
      );

      expect(result).toEqual({
        accessToken: 'access-token',
        user: mockUser,
      });
    });

    it('does not set a login cookie for a mobile client and returns user payload', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.login(
        loginDto,
        requestWith('mobile') as unknown as LoginRequest,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: mockUser,
      });
    });

    it('propagates the unverified-email rejection from AuthService', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Email not verified'),
      );

      await expect(
        controller.login(
          loginDto,
          requestWith() as unknown as LoginRequest,
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    const verifyDto: VerifyEmailDto = {
      email: 'dev@example.com',
      otp: '123456',
    };

    it('delegates to AuthService and issues tokens for a web client', async () => {
      mockAuthService.verifyEmail.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.verifyEmail(
        verifyDto,
        requestWith() as unknown as VerifyEmailRequest,
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith(verifyDto);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({ path: cookiePath }),
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        user: mockUser,
      });
    });

    it('returns both tokens and the user for a mobile client without a cookie', async () => {
      mockAuthService.verifyEmail.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.verifyEmail(
        verifyDto,
        requestWith('mobile') as unknown as VerifyEmailRequest,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: mockUser,
      });
    });
  });

  describe('resendVerification', () => {
    it('delegates to AuthService and returns no body', async () => {
      mockAuthService.resendVerificationEmail.mockResolvedValue();

      const dto = { email: 'dev@example.com' };

      const result = await controller.resendVerification(dto);

      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledWith(dto);
      expect(result).toBeUndefined();
    });
  });

  describe('google', () => {
    const googleAuthDto: GoogleAuthDto = {
      idToken: 'valid-google-id-token',
    };

    it('sets a refresh token cookie and returns user with accessToken for web client on google sign-in', async () => {
      mockAuthService.googleLogin.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.google(
        googleAuthDto,
        requestWith() as unknown as GoogleRequest,
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.googleLogin).toHaveBeenCalledWith(
        'valid-google-id-token',
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({ path: cookiePath }),
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        user: mockUser,
      });
    });
  });

  describe('refresh', () => {
    it('scopes the rotated refresh token cookie to the same path', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'rotated-token',
      });

      const request = requestWith(undefined, {
        refreshToken: 'refresh-token',
      }) as unknown as RefreshRequest;

      await controller.refresh(
        request,
        {},
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'rotated-token',
        expect.objectContaining({ path: cookiePath }),
      );
    });

    it('withholds the rotated refresh token from a web refresh body', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'rotated-token',
      });

      const request = requestWith(undefined, {
        refreshToken: 'refresh-token',
      }) as unknown as RefreshRequest;

      const result = await controller.refresh(
        request,
        {},
        mockResponse as unknown as Response,
      );

      expect(result).toEqual({ accessToken: 'access-token' });
    });

    it('refreshes a mobile client from the request body', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'rotated-token',
      });

      const request = requestWith('mobile') as unknown as RefreshRequest;

      const result = await controller.refresh(
        request,
        { refreshToken: 'body-refresh-token' },
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'body-refresh-token',
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'rotated-token',
      });
    });

    it('does not set a refresh cookie for a mobile client', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'rotated-token',
      });

      const request = requestWith('mobile') as unknown as RefreshRequest;

      await controller.refresh(
        request,
        { refreshToken: 'body-refresh-token' },
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('ignores the cookie when the client declares itself mobile', async () => {
      const request = requestWith('mobile', {
        refreshToken: 'cookie-refresh-token',
      }) as unknown as RefreshRequest;

      await expect(
        controller.refresh(request, {}, mockResponse as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });

    it('ignores the request body when the client is web', async () => {
      const request = requestWith('web') as unknown as RefreshRequest;

      await expect(
        controller.refresh(
          request,
          { refreshToken: 'body-refresh-token' },
          mockResponse as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });

    it('rejects an unsupported client platform', async () => {
      const request = requestWith('desktop', {
        refreshToken: 'refresh-token',
      }) as unknown as RefreshRequest;

      await expect(
        controller.refresh(request, {}, mockResponse as unknown as Response),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the refresh token cookie from the path it was set on', async () => {
      mockAuthService.logout.mockResolvedValue();

      const request = requestWith(undefined, {
        refreshToken: 'refresh-token',
      }) as unknown as LogoutRequest;

      await controller.logout(request, {}, mockResponse as unknown as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ path: cookiePath }),
      );
    });

    it('returns no logout response body', async () => {
      mockAuthService.logout.mockResolvedValue();

      const result = await controller.logout(
        requestWith(undefined, {
          refreshToken: 'refresh-token',
        }) as unknown as LogoutRequest,
        {},
        mockResponse as unknown as Response,
      );

      expect(result).toBeUndefined();
    });

    it('revokes every refresh token the client presents', async () => {
      mockAuthService.logout.mockResolvedValue();

      await controller.logout(
        requestWith(undefined, {
          refreshToken: 'cookie-refresh-token',
        }) as unknown as LogoutRequest,
        { refreshToken: 'body-refresh-token' },
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'cookie-refresh-token',
      );
      expect(mockAuthService.logout).toHaveBeenCalledWith('body-refresh-token');
      expect(mockAuthService.logout).toHaveBeenCalledTimes(2);
    });

    it('revokes a token presented in both places only once', async () => {
      mockAuthService.logout.mockResolvedValue();

      await controller.logout(
        requestWith(undefined, {
          refreshToken: 'same-token',
        }) as unknown as LogoutRequest,
        { refreshToken: 'same-token' },
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
    });

    it('clears the cookie without revoking when no token is presented', async () => {
      await controller.logout(
        requestWith() as unknown as LogoutRequest,
        {},
        mockResponse as unknown as Response,
      );

      expect(mockAuthService.logout).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalled();
    });

    it('accepts an unsupported platform header on logout', async () => {
      mockAuthService.logout.mockResolvedValue();

      await expect(
        controller.logout(
          requestWith('desktop', {
            refreshToken: 'refresh-token',
          }) as unknown as LogoutRequest,
          {},
          mockResponse as unknown as Response,
        ),
      ).resolves.toBeUndefined();

      expect(mockAuthService.logout).toHaveBeenCalledWith('refresh-token');
    });
  });

  describe('requestPasswordReset', () => {
    it('delegates the request to AuthService and returns no body', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue();

      const dto = { email: 'dev@example.com' };

      const result = await controller.requestPasswordReset(dto);

      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(dto);
      expect(result).toBeUndefined();
    });
  });

  describe('confirmPasswordReset', () => {
    it('delegates the reset to AuthService and returns no body', async () => {
      mockAuthService.confirmPasswordReset.mockResolvedValue();

      const dto = { token: 'raw-reset-token', newPassword: 'NewPassword123!' };

      const result = await controller.confirmPasswordReset(dto);

      expect(mockAuthService.confirmPasswordReset).toHaveBeenCalledWith(dto);
      expect(result).toBeUndefined();
    });
  });

  describe('getMe', () => {
    it('returns the current user loaded by AuthService', async () => {
      const user = {
        id: 'user-id',
        email: 'dev@example.com',
        role: 'USER',
      } as AuthenticatedUser;
      const currentUser: UserResponse = {
        id: 'user-id',
        email: 'dev@example.com',
        role: 'USER',
        fullName: 'Ada Obi',
        emailVerified: true,
        createdAt: new Date('2026-10-01T09:00:00.000Z'),
      };
      mockAuthService.findCurrentUser.mockResolvedValue(currentUser);

      const result = await controller.getMe(user);

      expect(mockAuthService.findCurrentUser).toHaveBeenCalledWith('user-id');
      expect(result).toEqual(currentUser);
    });
  });
});
