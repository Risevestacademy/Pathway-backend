import { Module } from '@nestjs/common';
import { PublishingService } from './publishing.service';
import { registerStrategies } from './strategies';
import { PublishingController } from './publishing.controller';

@Module({
  controllers: [PublishingController],
  providers: [
    PublishingService,
    {
      provide: 'REVISIONS_BOOTSTRAP',
      useFactory: () => {
        registerStrategies();
        return true;
      },
    },
  ],
  exports: [PublishingService],
})
export class RevisionsModule {}
