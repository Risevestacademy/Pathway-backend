import { Module } from '@nestjs/common';
import { PathwayStepsController } from './pathway-steps.controller';
import { PathwayStepsService } from './pathway-steps.service';

@Module({
  controllers: [PathwayStepsController],
  providers: [PathwayStepsService],
})
export class PathwayStepsModule {}
