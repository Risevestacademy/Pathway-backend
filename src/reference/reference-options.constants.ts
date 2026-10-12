import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
} from '../generated/prisma/client';

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  [EducationLevel.SECONDARY_SCHOOL]: 'Secondary school',
  [EducationLevel.DIPLOMA]: 'Diploma',
  [EducationLevel.BACHELOR_IN_PROGRESS]: "Bachelor's in progress",
  [EducationLevel.BACHELOR]: "Bachelor's degree",
  [EducationLevel.MASTERS]: "Master's degree",
  [EducationLevel.OTHER]: 'Other',
};

export const INTERNSHIP_COUNT_LABELS: Record<InternshipCount, string> = {
  [InternshipCount.NONE]: 'None',
  [InternshipCount.ONE]: '1',
  [InternshipCount.TWO]: '2',
  [InternshipCount.THREE_PLUS]: '3+',
};

export const EXPERIENCE_YEARS_LABELS: Record<ExperienceYears, string> = {
  [ExperienceYears.ZERO]: 'None yet',
  [ExperienceYears.UNDER_ONE]: 'Less than 1 year',
  [ExperienceYears.ONE_TO_TWO]: '1–2 years',
  [ExperienceYears.THREE_PLUS]: '3+ years',
};

export interface OptionItem<T extends string = string> {
  value: T;
  label: string;
}

export const toOptions = <T extends string>(
  enumObj: Record<string, T>,
  labels: Record<T, string>,
): OptionItem<T>[] =>
  Object.values(enumObj).map((value) => ({
    value,
    label: labels[value],
  }));
