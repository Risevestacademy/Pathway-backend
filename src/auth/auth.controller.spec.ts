import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService, AuthResult } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { type AuthenticatedUser } from './interfaces/authenticated-user.interface';

type RegisterRequest = Parameters<AuthController['register']>[1];
type LoginRequest = Parameters<AuthController['login']>[1];
type RefreshRequest = Parameters<AuthController['refresh']>[0];
type LogoutRequest = Parameters<AuthController['logout']>[0];

const requestWith = (platform?: string, cookies: object = {}) => ({
  get: () => platform,
  cookies,
});

describe('AuthController', () => {
  let controller: AuthController;

  const cookiePath = '/api/v1/auth';

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'dev@example.com',
    role: 'USER',
  };

  const mockAuthService = {
    register: jest.fn<() => Promise<AuthResult>>(),
    login: jest.fn<() => Promise<AuthResult>>(),
    refresh:
      jest.fn<() => Promise<{ accessToken: string; refreshToken: string }>>(),
    logout: jest.fn<() => Promise<void>>(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'API_VERSION') return 'v1';
      if (key === 'NODE_ENV') return 'test';
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
    };

    it('sets a refresh token cookie and returns user with accessToken for web client', async () => {
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.register(
        registerDto,
        requestWith() as unknown as RegisterRequest,
        mockResponse as unknown as Response,
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

    it('returns both tokens and user without setting cookie for mobile client', async () => {
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });

      const result = await controller.register(
        registerDto,
        requestWith('mobile') as unknown as RegisterRequest,
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

  describe('getMe', () => {
    it('returns the authenticated user as the me response body', async () => {
      const user = {
        id: 'user-id',
        email: 'dev@example.com',
        role: 'USER',
      } as AuthenticatedUser;

      const result = await controller.getMe(user);

      expect(result).toEqual(user);
    });
  });
});
