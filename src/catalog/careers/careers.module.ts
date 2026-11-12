import { Module } from '@nestjs/common';
import { CareersService } from './careers.service';
import { CareersController } from './careers.controller';
import { AdminCareersController } from './admin.controller';
import { CareerComparisonService } from './comparison/career-comparison.service';
import { MeCareersController } from './me-careers.controller';
import { PathwaysService } from './pathways/pathways.service';
import { TargetLevelsController } from './target-levels/target-levels.controller';

@Module({
  controllers: [
    CareersController,
    TargetLevelsController,
    AdminCareersController,
    MeCareersController,
  ],
  providers: [CareersService, PathwaysService, CareerComparisonService],
})
export class CareersModule {}
