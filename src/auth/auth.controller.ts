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

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { type AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  RegisterApiResponseDto,
  LoginApiResponseDto,
  LoginDto,
  RegisterDto,
} from './dto';

interface RequestWithCookies extends Request {
  cookies: {
    refreshToken?: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: RegisterApiResponseDto,
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
    type: LoginApiResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'HttpOnly refresh token cookie for web clients',
        schema: {
          type: 'string',
          example:
            'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/auth; HttpOnly; SameSite=Lax',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid Credentials' })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { data } = await this.authService.login(dto);

    this.setRefreshTokenCookie(response, data.refreshToken);

    return { data };
  }

  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description:
      'Access token refreshed successfully. Sets a new refresh token cookie for web clients.',
    type: LoginApiResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'HttpOnly rotated refresh token cookie for web clients',
        schema: {
          type: 'string',
          example:
            'refreshToken=eyJhbGciOiJIUzI1Ni...; Path=/auth; HttpOnly; SameSite=Lax',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token required or invalid',
  })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: RequestWithCookies,
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies.refreshToken ?? bodyRefreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const { data } = await this.authService.refresh(refreshToken);

    this.setRefreshTokenCookie(response, data.refreshToken);

    return { data };
  }

  @ApiOperation({ summary: 'Logout a user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: RequestWithCookies,
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies.refreshToken ?? bodyRefreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return {
      data: {
        message: 'Logged out successfully',
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return { data: user };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string) {
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth',
    });
  }
}
