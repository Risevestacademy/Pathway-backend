import { Module } from '@nestjs/common';
import { CommonModule } from './common';
import { AppConfigModule } from './config';
import { HealthModule } from './health';
import { PrismaModule } from './prisma';
import { UsersModule } from './users';
import { AppLoggerModule } from './logger';
import { AuthModule } from './auth';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    CommonModule,
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
