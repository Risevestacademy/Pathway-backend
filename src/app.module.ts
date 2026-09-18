import { Module } from '@nestjs/common';
import { CommonModule } from './common';
import { AppConfigModule } from './config';
import { HealthModule } from './health';
import { PrismaModule } from './prisma';
import { UsersModule } from './users';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
