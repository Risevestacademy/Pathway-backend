import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { StringValue } from 'ms';
import ms from 'ms';
import { UsersService } from '../users';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma';

type PrismaTransactionClient = Pick<PrismaService, 'refreshToken'>;

const hashRefreshToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface AuthResult {
  user: {
    id: string;
    email: string;
    role: Role;
  };
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

    const user = {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    };

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

    const userPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const tokens = await this.issueTokens(userPayload);

    return {
      user: userPayload,
      tokens,
    };
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

    const tokenHash = hashRefreshToken(refreshToken);

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

    const tokenHash = hashRefreshToken(refreshToken);

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

    const tokenHash = hashRefreshToken(refreshToken);

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
