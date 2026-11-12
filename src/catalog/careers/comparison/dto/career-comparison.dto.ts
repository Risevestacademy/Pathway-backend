import { ApiProperty } from '@nestjs/swagger';
import { Demand, TargetLevel } from '../../../../generated/prisma/client';
import { CareerOverviewSkillDto } from '../../dto/career-overview.dto';

export const OUTLOOK_MISMATCH_REASONS = [
  'MISSING_VALUE',
  'GEOGRAPHY',
  'PERIOD',
  'CURRENCY',
  'PAY_PERIOD',
] as const;

export type OutlookMismatchReason = (typeof OUTLOOK_MISMATCH_REASONS)[number];

export class ComparisonFieldDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Software Engineering' })
  name: string;

  @ApiProperty({ example: 'software-engineering' })
  slug: string;
}

export class ComparisonSourceDto {
  @ApiProperty({ example: 'U.S. Bureau of Labor Statistics' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  url: string | null;
}

export class ComparisonSalaryDto {
  @ApiProperty({ example: 'Lagos, Nigeria' })
  geography: string;

  @ApiProperty({ example: 'Q2 2025' })
  period: string;

  @ApiProperty({ type: String, nullable: true, example: 'entry-level' })
  experienceLevel: string | null;

  @ApiProperty({ type: String, nullable: true, example: '4500000.00' })
  median: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  percentile25: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  percentile75: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'NGN' })
  currency: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'year' })
  payPeriod: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'gross' })
  grossOrNet: string | null;

  @ApiProperty({ type: ComparisonSourceDto, nullable: true })
  source: ComparisonSourceDto | null;
}

export class ComparisonDemandDto {
  @ApiProperty({ example: 'Lagos, Nigeria' })
  geography: string;

  @ApiProperty({ example: '2025' })
  period: string;

  @ApiProperty({ enum: Demand, nullable: true, example: Demand.HIGH })
  demandLevel: Demand | null;

  @ApiProperty({ type: ComparisonSourceDto, nullable: true })
  source: ComparisonSourceDto | null;
}

export class ComparisonFirstStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Programming fundamentals' })
  title: string;
}

export class ComparisonPathwayDto {
  @ApiProperty({ example: 8 })
  stepCount: number;

  @ApiProperty({ example: 3 })
  stageCount: number;

  @ApiProperty({ type: ComparisonFirstStepDto, nullable: true })
  firstStep: ComparisonFirstStepDto | null;
}

export class ComparedCareerDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'backend-engineer' })
  slug: string;

  @ApiProperty({ example: 'Backend Engineer' })
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String, nullable: true })
  iconKey: string | null;

  @ApiProperty({ type: ComparisonFieldDto })
  field: ComparisonFieldDto;

  @ApiProperty({ type: String, nullable: true })
  roleSummary: string | null;

  @ApiProperty({ type: [String] })
  exampleActivities: string[];

  @ApiProperty({ enum: TargetLevel, isArray: true })
  targetLevels: TargetLevel[];

  @ApiProperty({ type: String, nullable: true })
  typicalEducationNote: string | null;

  @ApiProperty({ type: [CareerOverviewSkillDto] })
  skills: CareerOverviewSkillDto[];

  @ApiProperty({
    type: ComparisonSalaryDto,
    nullable: true,
    description:
      'The entry-level salary entry, else the earliest salary entry, else null',
  })
  salary: ComparisonSalaryDto | null;

  @ApiProperty({ type: ComparisonDemandDto, nullable: true })
  demand: ComparisonDemandDto | null;

  @ApiProperty({ type: ComparisonPathwayDto, nullable: true })
  pathway: ComparisonPathwayDto | null;
}

export class OutlookComparabilityDto {
  @ApiProperty({ example: true })
  comparable: boolean;

  @ApiProperty({
    enum: OUTLOOK_MISMATCH_REASONS,
    isArray: true,
    example: [],
    description: 'Why the two values cannot be compared; empty when comparable',
  })
  reasons: OutlookMismatchReason[];
}

export class ComparisonOutlookDto {
  @ApiProperty({ type: OutlookComparabilityDto })
  salary: OutlookComparabilityDto;

  @ApiProperty({ type: OutlookComparabilityDto })
  demand: OutlookComparabilityDto;
}

export class CareerComparisonDto {
  @ApiProperty({ type: [ComparedCareerDto] })
  careers: ComparedCareerDto[];

  @ApiProperty({ type: ComparisonOutlookDto })
  outlook: ComparisonOutlookDto;
}

export class SkillMatchSkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'TypeScript' })
  name: string;
}

export class NiceToHaveSkillMatchDto extends SkillMatchSkillDto {
  @ApiProperty({ example: false })
  matched: boolean;
}

export class SkillMatchDto {
  @ApiProperty({ type: [SkillMatchSkillDto] })
  matchedRequiredSkills: SkillMatchSkillDto[];

  @ApiProperty({ example: 3 })
  requiredSkillCount: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 67,
    description:
      'Share of required skills the user listed, 0 to 100; null when the career has no required skills',
  })
  percentage: number | null;

  @ApiProperty({
    type: [NiceToHaveSkillMatchDto],
    description: 'Listed but not counted in the percentage',
  })
  niceToHaveSkills: NiceToHaveSkillMatchDto[];
}
