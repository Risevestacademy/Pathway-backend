import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceService } from './reference.service';
import { FieldsService } from '../fields';
import { SkillsService } from '../skills';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
} from '../generated/prisma/client';

describe('ReferenceService', () => {
  let service: ReferenceService;

  const mockSkills = [
    { id: 's1', name: 'TypeScript', description: null },
    { id: 's2', name: 'NestJS', description: 'Node framework' },
  ];

  const mockFields = [
    { id: 'f1', name: 'Software', slug: 'software' },
    { id: 'f2', name: 'Data', slug: 'data' },
  ];

  const mockSkillsService = {
    getSkills: jest.fn<() => Promise<typeof mockSkills>>(),
  };

  const mockFieldsService = {
    getFields: jest.fn<() => Promise<typeof mockFields>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSkillsService.getSkills.mockResolvedValue(mockSkills);
    mockFieldsService.getFields.mockResolvedValue(mockFields);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceService,
        { provide: SkillsService, useValue: mockSkillsService },
        { provide: FieldsService, useValue: mockFieldsService },
      ],
    }).compile();

    service = module.get<ReferenceService>(ReferenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOnboardingOptions', () => {
    it('returns all five option groups', async () => {
      const result = await service.getOnboardingOptions();

      expect(Object.keys(result)).toEqual([
        'educationLevels',
        'internshipOptions',
        'experienceOptions',
        'skills',
        'fields',
      ]);
    });

    it('returns education, internship, and experience options as { value, label } pairs', async () => {
      const result = await service.getOnboardingOptions();

      for (const group of [
        result.educationLevels,
        result.internshipOptions,
        result.experienceOptions,
      ]) {
        expect(group.length).toBeGreaterThan(0);
        for (const option of group) {
          expect(option).toHaveProperty('value');
          expect(option).toHaveProperty('label');
          expect(option.label).toBeTruthy();
        }
      }

      expect(result.educationLevels.map((o) => o.value)).toEqual(
        Object.values(EducationLevel),
      );
      expect(result.internshipOptions.map((o) => o.value)).toEqual(
        Object.values(InternshipCount),
      );
      expect(result.experienceOptions.map((o) => o.value)).toEqual(
        Object.values(ExperienceYears),
      );
    });

    it('reuses SkillsService and FieldsService queries', async () => {
      await service.getOnboardingOptions();

      expect(mockSkillsService.getSkills).toHaveBeenCalledTimes(1);
      expect(mockFieldsService.getFields).toHaveBeenCalledTimes(1);
    });

    it('passes skills and fields straight through', async () => {
      const result = await service.getOnboardingOptions();

      expect(result.skills).toEqual(mockSkills);
      expect(result.fields).toEqual(mockFields);
    });
  });
});
