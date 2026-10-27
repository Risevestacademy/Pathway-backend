import { Module } from '@nestjs/common';
import { CareersService } from './careers.service';
import { CareersController } from './careers.controller';
import { AdminCareersController } from './admin.controller';
import { PathwaysService } from './pathways/pathways.service';
import { TargetLevelsController } from './target-levels/target-levels.controller';

@Module({
  controllers: [
    CareersController,
    TargetLevelsController,
    AdminCareersController,
  ],
  providers: [CareersService, PathwaysService],
})
export class CareersModule {}
