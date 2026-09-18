import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common';
import { AppConfigModule } from './config';
import { PrismaModule } from './prisma';
import { ExampleModule } from './example';

@Module({
  imports: [AppConfigModule, CommonModule, PrismaModule, ExampleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
