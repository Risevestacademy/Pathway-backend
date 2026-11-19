import { Module } from '@nestjs/common';
import { PathwayStepsController } from './pathway-steps.controller';
import { PathwayStepsService } from './pathway-steps.service';
import { MePathwayStepsController } from './me-pathway-steps.controller';
import { PathwayCompletionController } from './pathway-completion.controller';
import { PathwayCompletionService } from './pathway-completion.service';
import { PathwaysModule } from '../pathways';
import { ActivityModule } from '../../activity';

@Module({
  imports: [PathwaysModule, ActivityModule],
  controllers: [
    PathwayStepsController,
    MePathwayStepsController,
    PathwayCompletionController,
  ],
  providers: [PathwayStepsService, PathwayCompletionService],
})
export class PathwayStepsModule {}
