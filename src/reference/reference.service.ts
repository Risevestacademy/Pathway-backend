import { Injectable } from '@nestjs/common';
import { FieldsService } from '../fields';
import { SkillsService } from '../skills';
import { ReferenceOptionsDto } from './dto/reference-options.dto';
import {
  EDUCATION_LEVEL_LABELS,
  EXPERIENCE_YEARS_LABELS,
  INTERNSHIP_COUNT_LABELS,
  toOptions,
} from './reference-options.constants';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
} from '../generated/prisma/client';

@Injectable()
export class ReferenceService {
  constructor(
    private readonly fieldsService: FieldsService,
    private readonly skillsService: SkillsService,
  ) {}

  async getOnboardingOptions(): Promise<ReferenceOptionsDto> {
    const [skills, fields] = await Promise.all([
      this.skillsService.getSkills(),
      this.fieldsService.getFields(),
    ]);

    return {
      educationLevels: toOptions(EducationLevel, EDUCATION_LEVEL_LABELS),
      internshipOptions: toOptions(InternshipCount, INTERNSHIP_COUNT_LABELS),
      experienceOptions: toOptions(ExperienceYears, EXPERIENCE_YEARS_LABELS),
      skills,
      fields,
    };
  }
}
