import { Module } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PathwaysController } from './pathways.controller';

@Module({
  controllers: [PathwaysController],
  providers: [PathwaysService],
})
export class PathwaysModule {}
