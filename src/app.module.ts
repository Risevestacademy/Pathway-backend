import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common';
import { AppConfigModule } from './config';

@Module({
  imports: [AppConfigModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
