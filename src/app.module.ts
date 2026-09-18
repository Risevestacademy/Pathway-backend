import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common';
import { AppConfigModule } from './config';
import { HealthModule } from './health';
import { PrismaModule } from './prisma';
import { UsersModule } from './users';
import { ExampleModule } from './example';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    ExampleModule,
    HealthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
