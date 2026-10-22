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
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { StringValue } from 'ms';
import ms from 'ms';
import { UsersService, type UserResponse } from '../users';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { AuthProvider, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma';
import { NotificationService } from '../notifications';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import { AnalyticsService } from '../analytics';

type PrismaTransactionClient = Pick<PrismaService, 'refreshToken'>;

type EmailVerificationFailure =
  'UNKNOWN_OR_VERIFIED_EMAIL' | 'OTP_EXPIRED_OR_LOCKED' | 'INVALID_OTP';

const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;
const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

// Provider errors can carry the recipient and the rendered email
const describeSendError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode:
        'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    return {
      message:
        typeof obj.message === 'string' ? obj.message : JSON.stringify(obj),
      statusCode:
        typeof obj.statusCode === 'number' ? obj.statusCode : undefined,
    };
  }

  return {
    message: typeof error === 'string' ? error : String(error),
    statusCode: undefined,
  };
};

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
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly analytics: AnalyticsService,
  ) {}

  // Register a new user
  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; email: string }> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const createdUser = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });

    const otp = this.generateOtp();

    await this.prisma.$transaction(async (tx) => {
      // Only one live OTP per user at a time.
      await tx.emailVerificationOtp.updateMany({
        where: { userId: createdUser.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.emailVerificationOtp.create({
        data: {
          userId: createdUser.id,
          codeHash: this.hashOtp(otp),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        },
      });
    });

    void this.sendEmailVerificationOtp(createdUser.id, createdUser.email, otp);

    this.logger.log({ userId: createdUser.id }, 'User registered');
    this.analytics.capture('user_signed_up', createdUser.id, {
      method: 'email',
    });

    return { message: 'Verification code sent', email: createdUser.email };
  }

  // Login a user
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    const passwordHash = user?.passwordHash || this.DUMMY_HASH;

    const isPasswordValid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !isPasswordValid) {
      this.logger.warn({ reason: 'INVALID_CREDENTIALS' }, 'Login failed');

      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerifiedAt) {
      this.logger.warn(
        { userId: user.id, reason: 'EMAIL_NOT_VERIFIED' },
        'Login blocked: email not verified',
      );
      throw new UnauthorizedException('Email not verified');
    }

    const tokens = await this.issueTokens(user);

    this.logger.log({ userId: user.id }, 'Login succeeded');
    this.analytics.capture('user_logged_in', user.id, { method: 'password' });

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

  // google login/signup
  async googleLogin(idToken: string): Promise<AuthResult> {
    const googleProfile = await this.googleOAuthService.verifyIdToken(idToken);

    const email = googleProfile.email.trim().toLowerCase();
    const now = new Date();

    let isNewUser = false;
    let result: AuthResult;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        // The Google subject is the stable identity key.
        const identity = await tx.authIdentity.findUnique({
          where: {
            provider_providerUserId: {
              provider: AuthProvider.GOOGLE,
              providerUserId: googleProfile.googleId,
            },
          },
          include: {
            user: { include: { profile: true } },
          },
        });

        // An existing Google identity always resolves to its linked user.
        if (identity) {
          const tokens = await this.issueTokens(identity.user, tx);

          return {
            user: this.usersService.toUserResponse(identity.user),
            tokens,
          };
        }

        let user = await tx.user.findUnique({
          where: { email },
          include: { profile: true },
        });

        if (user) {
          if (!user.emailVerifiedAt) {
            // A verified Google identity takes over this unverified
            // local account, so its old password must stop working.
            await tx.user.update({
              where: { id: user.id },
              data: {
                passwordHash: null,
                emailVerifiedAt: now,
              },
            });

            await tx.refreshToken.updateMany({
              where: {
                userId: user.id,
                revokedAt: null,
              },
              data: { revokedAt: now },
            });

            await tx.passwordResetToken.deleteMany({
              where: {
                userId: user.id,
                usedAt: null,
              },
            });

            await tx.emailVerificationOtp.deleteMany({
              where: {
                userId: user.id,
                consumedAt: null,
              },
            });

            user = await tx.user.findUniqueOrThrow({
              where: { id: user.id },
              include: { profile: true },
            });
          }

          // Verified local accounts keep their existing password.
          await tx.authIdentity.create({
            data: {
              provider: AuthProvider.GOOGLE,
              providerUserId: googleProfile.googleId,
              userId: user.id,
            },
          });
        } else {
          // New Google account: user, profile and identity are atomic.
          user = await tx.user.create({
            data: {
              email,
              passwordHash: null,
              emailVerifiedAt: now,
              profile: {
                create: {
                  fullName: googleProfile.fullName,
                },
              },
              identities: {
                create: {
                  provider: AuthProvider.GOOGLE,
                  providerUserId: googleProfile.googleId,
                },
              },
            },
            include: { profile: true },
          });
          isNewUser = true;
        }

        const tokens = await this.issueTokens(user, tx);

        return {
          user: this.usersService.toUserResponse(user),
          tokens,
        };
      });
    } catch (error) {
      // The database's unique constraints protect against concurrent
      // attempts to claim the same email or Google identity.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Account or Google identity already exists; please retry',
        );
      }

      throw error;
    }

    const userId = result.user.id;

    this.logger.log({ userId, isNewUser }, 'Google sign-in succeeded');

    if (isNewUser) {
      this.analytics.capture('user_signed_up', userId, { method: 'google' });
    }
    this.analytics.capture('user_logged_in', userId, { method: 'google' });

    return result;
  }

  // Email a password reset link if the account exists
  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      this.logger.warn(
        { reason: 'UNKNOWN_EMAIL' },
        'Password reset requested for an unknown email',
      );

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
      this.logger.error(
        { userId, error: describeSendError(error) },
        'Password reset email failed',
      );
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

      // Confirming a reset proves the user controls this inbox — treat it as verification too
      await tx.user.updateMany({
        where: { id: resetToken.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });

      return resetToken.userId;
    });

    this.logger.log({ userId }, 'Password reset');
    this.analytics.capture('password_reset_completed', userId);
  }

  private passwordResetFailed(): BadRequestException {
    this.logger.warn(
      { reason: 'INVALID_OR_EXPIRED_TOKEN' },
      'Password reset failed',
    );

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

  private async sendEmailVerificationOtp(
    userId: string,
    email: string,
    otp: string,
  ): Promise<void> {
    try {
      await this.notificationService.send(email, 'email-verification-otp', {
        otp,
        expiresInMinutes: OTP_TTL_MINUTES,
      });

      this.logger.log({ userId }, 'Email verification OTP sent');
    } catch (error) {
      this.logger.error(
        { userId, error: describeSendError(error) },
        'Email verification OTP send failed',
      );
    }
  }

  private generateOtp(): string {
    // randomInt is cryptographically secure; Math.random is not.
    // Zero-padding keeps codes a fixed 6 digits (e.g. 000042).
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtp(otp: string): string {
    return hashToken(otp);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || user.emailVerifiedAt) {
      throw this.emailVerificationFailed('UNKNOWN_OR_VERIFIED_EMAIL', user?.id);
    }

    const now = new Date();
    const codeHash = this.hashOtp(dto.otp);

    // Failures are returned, not thrown, so the attempt count commits
    const outcome = await this.prisma.$transaction(
      async (
        tx,
      ): Promise<
        | { verified: true; result: AuthResult }
        | { verified: false; reason: EmailVerificationFailure }
      > => {
        const row = await tx.emailVerificationOtp.findFirst({
          where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });

        if (!row) {
          return { verified: false, reason: 'OTP_EXPIRED_OR_LOCKED' };
        }

        // One conditional update, so concurrent guesses can't pass the cap
        const counted = await tx.emailVerificationOtp.updateMany({
          where: { id: row.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
          data: { attempts: { increment: 1 } },
        });

        if (counted.count === 0) {
          return { verified: false, reason: 'OTP_EXPIRED_OR_LOCKED' };
        }

        if (row.codeHash !== codeHash) {
          return { verified: false, reason: 'INVALID_OTP' };
        }

        // Correct code — consume this and any other live OTPs, mark verified.
        await tx.emailVerificationOtp.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: now },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: now },
        });

        const verifiedUser = { ...user, emailVerifiedAt: now };

        const tokens = await this.issueTokens(verifiedUser, tx);

        return {
          verified: true,
          result: {
            user: this.usersService.toUserResponse(verifiedUser),
            tokens,
          },
        };
      },
    );

    if (!outcome.verified) {
      throw this.emailVerificationFailed(outcome.reason, user.id);
    }

    this.logger.log({ userId: user.id }, 'Email verified');
    this.analytics.capture('email_verified', user.id);

    return outcome.result;
  }

  private emailVerificationFailed(
    reason: EmailVerificationFailure,
    userId?: string,
  ): BadRequestException {
    this.logger.warn({ userId, reason }, 'Email verification failed');
    return new BadRequestException('Invalid or expired verification code');
  }

  async resendVerificationEmail(dto: ResendVerificationDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || user.emailVerifiedAt) {
      this.logger.warn(
        { reason: 'UNKNOWN_OR_VERIFIED_EMAIL' },
        'Resend verification requested for an unknown or already-verified email',
      );
      return;
    }

    const otp = this.generateOtp();

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.emailVerificationOtp.create({
        data: {
          userId: user.id,
          codeHash: this.hashOtp(otp),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        },
      });
    });

    void this.sendEmailVerificationOtp(user.id, user.email, otp);
  }
}
