import { Module } from '@nestjs/common';
import { PathwayStepsController } from './pathway-steps.controller';
import { PathwayStepsService } from './pathway-steps.service';
import { MePathwayStepsController } from './me-pathway-steps.controller';
import { PathwaysModule } from '../pathways';

@Module({
  imports: [PathwaysModule],
  controllers: [PathwayStepsController, MePathwayStepsController],
  providers: [PathwayStepsService],
})
export class PathwayStepsModule {}
