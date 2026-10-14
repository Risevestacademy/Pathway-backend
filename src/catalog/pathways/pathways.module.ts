import { Module } from '@nestjs/common';
import { PathwaysService } from './pathways.service';
import { PathwaysController } from './pathways.controller';
import { MeController } from './me.controller';

@Module({
  controllers: [PathwaysController, MeController],
  providers: [PathwaysService],
})
export class PathwaysModule {}
