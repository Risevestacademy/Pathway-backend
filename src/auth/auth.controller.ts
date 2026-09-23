import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { type AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  RegisterResponseDto,
  AuthTokensResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto';
import {
  CLIENT_PLATFORM_API_HEADER,
  type ClientPlatform,
  resolveClientPlatform,
} from './utils/client-platform';
import { apiPrefix } from '../common';
import { type EnvironmentVariables } from '../config';

interface RequestWithCookies extends Request {
  cookies: {
    refreshToken?: string;
  };
}

@Controller('auth')
export class AuthController {
  private readonly refreshTokenCookiePath: string;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.refreshTokenCookiePath = `/${apiPrefix(configService)}/auth`;
  }

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: RegisterResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Login a user' })
  @ApiResponse({
    status: 200,
    description:
      'User logged in successfully. Sets a refresh token cookie for web clients.',
    type: AuthTokensResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'HttpOnly refresh token cookie for web clients',
        schema: {
          type: 'string',
          example:
            'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid Credentials' })
  @ApiResponse({
    status: 400,
    description: 'Unsupported X-Client-Platform value',
  })
  @ApiHeader(CLIENT_PLATFORM_API_HEADER)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const platform = resolveClientPlatform(request);

    const tokens = await this.authService.login(dto);

    return this.deliverTokens(response, platform, tokens);
  }

  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description:
      'Access token refreshed successfully. Sets a new refresh token cookie for web clients.',
    type: AuthTokensResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'HttpOnly rotated refresh token cookie for web clients',
        schema: {
          type: 'string',
          example:
            'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported X-Client-Platform value',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token required or invalid',
  })
  @ApiHeader(CLIENT_PLATFORM_API_HEADER)
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: RequestWithCookies,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const platform = resolveClientPlatform(request);

    const refreshToken =
      platform === 'mobile' ? dto.refreshToken : request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const tokens = await this.authService.refresh(refreshToken);

    return this.deliverTokens(response, platform, tokens);
  }

  @ApiOperation({ summary: 'Logout a user' })
  @ApiResponse({
    status: 204,
    description:
      'Every refresh token presented is revoked and the web refresh token cookie is cleared.',
    headers: {
      'Set-Cookie': {
        description: 'Expired refresh token cookie for web clients',
        schema: {
          type: 'string',
          example:
            'refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        },
      },
    },
  })
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: RequestWithCookies,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = new Set(
      [request.cookies?.refreshToken, dto.refreshToken].filter(
        (token): token is string => Boolean(token),
      ),
    );

    await Promise.all(
      [...presented].map((token) => this.authService.logout(token)),
    );

    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: this.refreshTokenCookiePath,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private deliverTokens(
    response: Response,
    platform: ClientPlatform,
    tokens: { accessToken: string; refreshToken: string },
  ): AuthTokensResponseDto {
    if (platform === 'mobile') {
      return tokens;
    }

    this.setRefreshTokenCookie(response, tokens.refreshToken);

    return { accessToken: tokens.accessToken };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: this.refreshTokenCookiePath,
    });
  }
}
