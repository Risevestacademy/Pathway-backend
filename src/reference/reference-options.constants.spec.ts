import { jest } from '@jest/globals';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
} from '../generated/prisma/client';
import {
  EDUCATION_LEVEL_LABELS,
  EXPERIENCE_YEARS_LABELS,
  INTERNSHIP_COUNT_LABELS,
  toOptions,
} from './reference-options.constants';

describe('reference option labels', () => {
  it.each<[string, Record<string, string>, Record<string, string>]>([
    ['EducationLevel', EducationLevel, EDUCATION_LEVEL_LABELS],
    ['InternshipCount', InternshipCount, INTERNSHIP_COUNT_LABELS],
    ['ExperienceYears', ExperienceYears, EXPERIENCE_YEARS_LABELS],
  ])('every %s value has a non-empty label', (_name, enumObj, labels) => {
    for (const value of Object.values(enumObj)) {
      expect(labels[value]).toBeTruthy();
    }
  });

  it.each<[string, Record<string, string>, Record<string, string>]>([
    ['EducationLevel', EducationLevel, EDUCATION_LEVEL_LABELS],
    ['InternshipCount', InternshipCount, INTERNSHIP_COUNT_LABELS],
    ['ExperienceYears', ExperienceYears, EXPERIENCE_YEARS_LABELS],
  ])(
    '%s labels have no extra keys beyond the enum',
    (_name, enumObj, labels) => {
      expect(Object.keys(labels).sort()).toEqual(Object.values(enumObj).sort());
    },
  );

  it('maps enum values to { value, label } options in enum order', () => {
    const result = toOptions(EducationLevel, EDUCATION_LEVEL_LABELS);

    expect(result).toEqual([
      { value: EducationLevel.SECONDARY_SCHOOL, label: 'Secondary school' },
      { value: EducationLevel.DIPLOMA, label: 'Diploma' },
      {
        value: EducationLevel.BACHELOR_IN_PROGRESS,
        label: "Bachelor's in progress",
      },
      { value: EducationLevel.BACHELOR, label: "Bachelor's degree" },
      { value: EducationLevel.MASTERS, label: "Master's degree" },
      { value: EducationLevel.OTHER, label: 'Other' },
    ]);
  });
});
