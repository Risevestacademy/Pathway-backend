import { Module } from '@nestjs/common';
import { PathwayService } from './pathway.service';
import { PathwayController } from './pathway.controller';

@Module({
  controllers: [PathwayController],
  providers: [PathwayService],
})
export class PathwayModule {}
