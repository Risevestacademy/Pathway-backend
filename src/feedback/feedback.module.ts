import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications';
import { FeedbackController } from './feedback.controller';
import { AdminController } from './admin.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FeedbackController, AdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
