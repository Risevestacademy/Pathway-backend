import { Module } from '@nestjs/common';
import { ActivityModule } from '../../activity';
import { PathwaysService } from './pathways.service';
import { PathwaysController } from './pathways.controller';
import { MeController } from './me.controller';
import { PathwayLearningService } from './pathway-learning.service';
import { StageQuizService } from './stage-quiz.service';

@Module({
  imports: [ActivityModule],
  controllers: [PathwaysController, MeController],
  providers: [PathwaysService, PathwayLearningService, StageQuizService],
  exports: [PathwaysService],
})
export class PathwaysModule {}
