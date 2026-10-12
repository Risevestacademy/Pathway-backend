import { Module } from '@nestjs/common';
import { FieldsModule } from '../fields';
import { SkillsModule } from '../skills';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';

@Module({
  imports: [FieldsModule, SkillsModule],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
