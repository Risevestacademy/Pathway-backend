import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { type AuthenticatedUser } from './interfaces/authenticated-user.interface';

type LoginRequest = Parameters<AuthController['login']>[1];

const requestWith = (platform?: string, cookies: object = {}) => ({
  get: () => platform,
  cookies,
});
type RefreshRequest = Parameters<AuthController['refresh']>[0];
type LogoutRequest = Parameters<AuthController['logout']>[0];

describe('AuthController', () => {
  let controller: AuthController;

  const cookiePath = '/api/v1/auth';

  const mockAuthService = {
    login:
      jest.fn<() => Promise<{ accessToken: string; refreshToken: string }>>(),
    refresh:
      jest.fn<() => Promise<{ accessToken: string; refreshToken: string }>>(),
    logout: jest.fn<() => Promise<{ message: string }>>(),
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

  it('scopes the refresh token cookie to the versioned auth base path', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const dto: LoginDto = {
      email: 'dev@example.com',
      password: 'Password123!',
    };

    await controller.login(
      dto,
      requestWith() as unknown as LoginRequest,
      mockResponse as unknown as Response,
    );

    expect(mockResponse.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ path: cookiePath }),
    );
  });

  it('scopes the rotated refresh token cookie to the same path', async () => {
    mockAuthService.refresh.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'rotated-token',
    });

    const request = requestWith(undefined, {
      refreshToken: 'refresh-token',
    }) as unknown as RefreshRequest;

    await controller.refresh(request, {}, mockResponse as unknown as Response);

    expect(mockResponse.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'rotated-token',
      expect.objectContaining({ path: cookiePath }),
    );
  });

  it('clears the refresh token cookie from the path it was set on', async () => {
    mockAuthService.logout.mockResolvedValue({
      message: 'Logged out successfully',
    });

    const request = requestWith(undefined, {
      refreshToken: 'refresh-token',
    }) as unknown as LogoutRequest;

    await controller.logout(
      request,
      undefined,
      mockResponse as unknown as Response,
    );

    expect(mockResponse.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ path: cookiePath }),
    );
  });

  it('withholds the refresh token from a web login body', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const dto: LoginDto = {
      email: 'dev@example.com',
      password: 'Password123!',
    };

    const result = await controller.login(
      dto,
      requestWith() as unknown as LoginRequest,
      mockResponse as unknown as Response,
    );

    expect(result).toEqual({ accessToken: 'access-token' });
  });

  it('does not set a login cookie for a mobile client', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const dto: LoginDto = {
      email: 'dev@example.com',
      password: 'Password123!',
    };

    const result = await controller.login(
      dto,
      requestWith('mobile') as unknown as LoginRequest,
      mockResponse as unknown as Response,
    );

    expect(mockResponse.cookie).not.toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
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

    expect(mockAuthService.refresh).toHaveBeenCalledWith('body-refresh-token');
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
