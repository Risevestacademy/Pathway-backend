import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users';
import { NotificationsModule } from '../notifications';
import { TeamsModule } from '../teams';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import { StringValue } from 'ms';

@Module({
  imports: [
    ConfigModule,
    PassportModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET')!,

        signOptions: {
          expiresIn: configService.get<StringValue>('JWT_ACCESS_EXPIRY', '15m'),
        },
      }),
    }),

    UsersModule,
    NotificationsModule,
    TeamsModule,
  ],

  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleOAuthService],
  exports: [AuthService, GoogleOAuthService],
})
export class AuthModule {}
