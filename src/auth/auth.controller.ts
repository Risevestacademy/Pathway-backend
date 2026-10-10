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
import ms, { type StringValue } from 'ms';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  AuthTokensResponseDto,
  AuthResponseDto,
  ConfirmPasswordResetDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto';
import { UserResponseDto } from '../users';
import {
  CLIENT_PLATFORM_API_HEADER,
  type ClientPlatform,
  resolveClientPlatform,
} from './utils/client-platform';
import {
  apiPrefix,
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
} from '../common';
import { type EnvironmentVariables } from '../config';
import { AuthThrottle } from '../common/throttler';

interface RequestWithCookies extends Request {
  cookies: {
    refreshToken?: string;
  };
}

@Controller('auth')
export class AuthController {
  private readonly refreshTokenCookiePath: string;
  private readonly refreshTokenMaxAge: number;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.refreshTokenCookiePath = `/${apiPrefix(configService)}/auth`;
    this.refreshTokenMaxAge = ms(
      configService.get('JWT_REFRESH_EXPIRY', { infer: true }) as StringValue,
    );
  }

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description:
      'User registered successfully. Sets a refresh token cookie for web clients.',
    type: AuthResponseDto,
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
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({
    status: 400,
    description: 'Unsupported X-Client-Platform value',
  })
  @ApiHeader(CLIENT_PLATFORM_API_HEADER)
  @AuthThrottle()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const platform = resolveClientPlatform(request);

    const { user, tokens } = await this.authService.register(dto);

    return this.deliverTokens(response, platform, tokens, user);
  }

  @ApiOperation({ summary: 'Login a user' })
  @ApiResponse({
    status: 200,
    description:
      'User logged in successfully. Sets a refresh token cookie for web clients.',
    type: AuthResponseDto,
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
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const platform = resolveClientPlatform(request);

    const { user, tokens } = await this.authService.login(dto);

    return this.deliverTokens(response, platform, tokens, user);
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
  @AuthThrottle()
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

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 204,
    description:
      'Always returned for a valid email, whether or not an account exists. A reset link is emailed only when one does.',
  })
  @ApiResponse({ status: 400, description: 'Email is missing or invalid' })
  @AuthThrottle()
  @Post('password-reset/request')
  @HttpCode(204)
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<void> {
    await this.authService.requestPasswordReset(dto);
  }

  @ApiOperation({ summary: 'Set a new password using a password reset token' })
  @ApiResponse({
    status: 204,
    description:
      'Password updated. The reset token is marked used and all existing sessions are revoked.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Reset token is invalid, expired or already used, or the body failed validation',
  })
  @AuthThrottle()
  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<void> {
    await this.authService.confirmPasswordReset(dto);
  }

  @ApiOperation({ summary: "Verify a user's email address" })
  @ApiResponse({ status: 204, description: 'Email verified.' })
  @ApiResponse({
    status: 400,
    description: 'Verification token is invalid, expired or already used',
  })
  @AuthThrottle()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto);
  }

  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({
    status: 204,
    description:
      'Always returned, whether or not an account exists or is already verified. A new link is emailed only when appropriate.',
  })
  @AuthThrottle()
  @Post('resend-verification')
  @HttpCode(204)
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.authService.resendVerificationEmail(dto);
  }

  @ApiOperation({ summary: 'Get the signed-in user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({
    status: 401,
    description:
      'Access token missing or invalid, or the user no longer exists',
  })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.authService.findCurrentUser(user.id);
  }

  private deliverTokens(
    response: Response,
    platform: ClientPlatform,
    tokens: { accessToken: string; refreshToken: string },
    user?: UserResponseDto,
  ): AuthTokensResponseDto | AuthResponseDto {
    if (platform === 'mobile') {
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ...(user && { user }),
      };
    }

    this.setRefreshTokenCookie(response, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      ...(user && { user }),
    };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: this.refreshTokenMaxAge,
      path: this.refreshTokenCookiePath,
    });
  }
}
