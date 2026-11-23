import { Module } from '@nestjs/common';
import { PublishingService } from './publishing.service';
import { registerStrategies } from './strategies';

@Module({
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
