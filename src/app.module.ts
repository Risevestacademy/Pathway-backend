import { Module } from '@nestjs/common';
import { CommonModule } from './common';
import { AppConfigModule } from './config';
import { HealthModule } from './health';
import { PrismaModule } from './prisma';
import { UsersModule } from './users';
import { AppLoggerModule } from './logger';
import { AuthModule } from './auth';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { throttlerOptionsFactory } from './common/throttler';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    CommonModule,
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: throttlerOptionsFactory,
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
