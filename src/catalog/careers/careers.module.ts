import { Module } from '@nestjs/common';
import { CareersService } from './careers.service';
import { CareersController } from './careers.controller';
import { PathwaysService } from './pathways/pathways.service';
import { TargetLevelsController } from './target-levels/target-levels.controller';

@Module({
  controllers: [CareersController, TargetLevelsController],
  providers: [CareersService, PathwaysService],
})
export class CareersModule {}
