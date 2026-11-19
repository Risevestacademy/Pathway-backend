import { Module } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PathwaysController } from './pathways.controller';
import { MeController } from './me.controller';
import { PathwayLearningService } from './pathway-learning.service';

@Module({
  controllers: [PathwaysController, MeController],
  providers: [PathwaysService, PathwayLearningService],
  exports: [PathwaysService],
})
export class PathwaysModule {}
