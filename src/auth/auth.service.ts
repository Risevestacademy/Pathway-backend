import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { StringValue } from 'ms';
import ms from 'ms';
import { UsersService, type UserResponse } from '../users';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma';
import { NotificationService } from '../notifications';

type PrismaTransactionClient = Pick<PrismaService, 'refreshToken'>;

const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface AuthResult {
  user: UserResponse;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly DUMMY_HASH =
    '$2b$12$LQv3c1yqBW1QYbB9LQmZ5eK8mY4jV6X3cT9nP2rH7sD1wF0gA6bC';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // Register a new user
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const createdUser = await this.usersService.create({
      email: dto.email,
      passwordHash,
    });

    const user = this.usersService.toUserResponse(createdUser);

    const tokens = await this.issueTokens(user);

    this.logger.log({ userId: user.id }, 'User registered');

    return {
      user,
      tokens,
    };
  }

  // Login a user
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    const passwordHash = user?.passwordHash || this.DUMMY_HASH;

    const isPasswordValid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !isPasswordValid) {
      this.logger.warn({ email: dto.email }, 'Login failed');

      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log({ userId: user.id }, 'Login succeeded');

    const tokens = await this.issueTokens(user);

    return {
      user: this.usersService.toUserResponse(user),
      tokens,
    };
  }

  async findCurrentUser(userId: string): Promise<UserResponse> {
    const user = await this.usersService
      .findById(userId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) {
          return null;
        }

        throw error;
      });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.usersService.toUserResponse(user);
  }

  // Refresh access token using refresh token
  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = await this.decodeRefreshToken(refreshToken);

    if (!payload) {
      throw this.refreshFailed();
    }

    const tokenHash = hashToken(refreshToken);

    const user = await this.usersService
      .findById(payload.sub)
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) {
          return null;
        }

        throw error;
      });

    if (!user) {
      throw this.refreshFailed(payload.sub);
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (revoked.count === 0) {
        throw this.refreshFailed(payload.sub);
      }

      return this.issueTokens(user, tx);
    });
  }

  private async decodeRefreshToken(
    refreshToken: string,
  ): Promise<JwtPayload | null> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
      });
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Refresh token verification failed',
      );

      return null;
    }
  }

  private refreshFailed(userId?: string): UnauthorizedException {
    this.logger.warn({ userId }, 'Refresh failed');

    return new UnauthorizedException('Invalid refresh token');
  }

  // Logout a user
  async logout(refreshToken: string): Promise<void> {
    const payload = await this.decodeRefreshToken(refreshToken);

    if (!payload) {
      return;
    }

    const tokenHash = hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log({ userId: payload.sub }, 'User logged out');
  }

  // Email a password reset link if the account exists
  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      this.logger.log('Password reset requested for an unknown email');

      return;
    }

    const token = randomBytes(32).toString('hex');

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000,
          ),
        },
      });
    });

    // Send without awaiting to keep response time uniform
    void this.sendPasswordResetEmail(user.id, user.email, token);
  }

  private async sendPasswordResetEmail(
    userId: string,
    email: string,
    token: string,
  ): Promise<void> {
    try {
      const resetUrl = new URL(
        this.configService.get<string>('PASSWORD_RESET_URL')!,
      );
      resetUrl.searchParams.set('token', token);

      await this.notificationService.send(email, 'password-reset', {
        resetUrl: resetUrl.toString(),
        expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
      });

      this.logger.log({ userId }, 'Password reset email sent');
    } catch (error) {
      this.logger.error({ userId, err: error }, 'Password reset email failed');
    }
  }

  // Set a new password using a reset token
  async confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<void> {
    const tokenHash = hashToken(dto.token);

    const userId = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const resetToken = await tx.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        select: { id: true, userId: true },
      });

      if (!resetToken) {
        throw this.passwordResetFailed();
      }

      const passwordHash = await bcrypt.hash(dto.newPassword, 12);

      // Guard against two concurrent requests using the same token
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null },
        data: { usedAt: now },
      });

      if (claimed.count === 0) {
        throw this.passwordResetFailed();
      }

      await this.usersService.updatePasswordHash(
        resetToken.userId,
        passwordHash,
        tx,
      );

      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });

      return resetToken.userId;
    });

    this.logger.log({ userId }, 'Password reset');
  }

  private passwordResetFailed(): BadRequestException {
    this.logger.warn('Password reset failed');

    return new BadRequestException('Invalid or expired reset token');
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      role: Role;
    },
    client: PrismaTransactionClient = this.prisma,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const refreshPayload = {
      sub: user.id,
      jti: randomUUID(),
    };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET')!;

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;

    const accessExpiry = this.configService.get<StringValue>(
      'JWT_ACCESS_EXPIRY',
      '15m',
    );

    const refreshExpiry = this.configService.get<StringValue>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessExpiry,
      }),

      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiry,
      }),
    ]);

    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date(Date.now() + ms(refreshExpiry));

    await client.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
