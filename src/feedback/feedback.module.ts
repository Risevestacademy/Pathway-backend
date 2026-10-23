import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { AdminController } from './admin.controller';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [FeedbackController, AdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
