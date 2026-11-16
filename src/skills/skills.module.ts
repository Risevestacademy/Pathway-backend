import { Module } from '@nestjs/common';
import { SkillsController } from './skills.controller';
import { MeSkillsController } from './me-skills.controller';
import { SkillsService } from './skills.service';
import { SkillsAssessmentService } from './skills-assessment.service';

@Module({
  controllers: [SkillsController, MeSkillsController],
  providers: [SkillsService, SkillsAssessmentService],
  exports: [SkillsService],
})
export class SkillsModule {}
