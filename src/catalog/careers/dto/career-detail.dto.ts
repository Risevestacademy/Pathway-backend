import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CareerStatus,
  Demand,
  OutlookType,
  TargetLevel,
} from '../../../generated/prisma/client';

export class CareerFieldDto {
  @ApiProperty({
    description: 'Name of the field/category',
  })
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug for the field',
  })
  slug: string;
}

export class CareerSkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class CareerPathwaySummaryDto {
  @ApiProperty({
    description: 'Pathway UUID',
  })
  id: string;

  @ApiProperty({
    description: 'Pathway title',
  })
  title: string;

  @ApiProperty({
    description: 'Number of steps in the pathway',
  })
  stepCount: number;
}

export class OutlookDataDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: OutlookType,
  })
  type: OutlookType;

  @ApiProperty()
  geography: string;

  @ApiProperty()
  source: string;

  @ApiPropertyOptional()
  sourceUrl: string | null;

  @ApiProperty()
  period: string;

  @ApiPropertyOptional({
    description: 'Decimal serialized as a string',
  })
  median: string | null;

  @ApiPropertyOptional({
    description: 'Decimal serialized as a string',
  })
  percentile25: string | null;

  @ApiPropertyOptional({
    description: 'Decimal serialized as a string',
  })
  percentile75: string | null;

  @ApiPropertyOptional()
  currency: string | null;

  @ApiPropertyOptional()
  payPeriod: string | null;

  @ApiPropertyOptional()
  grossOrNet: string | null;

  @ApiPropertyOptional()
  experienceLevel: string | null;

  @ApiPropertyOptional()
  baseYear: number | null;

  @ApiPropertyOptional()
  baseValue: number | null;

  @ApiPropertyOptional()
  projectedYear: number | null;

  @ApiPropertyOptional()
  projectedValue: number | null;

  @ApiPropertyOptional({
    description: 'Decimal serialized as a string',
  })
  growthPercent: string | null;

  @ApiPropertyOptional({
    enum: Demand,
  })
  demandLevel: Demand | null;

  @ApiProperty()
  updatedAt: Date;
}

export class CareerDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  roleSummary: string;

  @ApiProperty({
    type: [String],
  })
  exampleActivities: string[];

  @ApiPropertyOptional()
  typicalEducationNote: string | null;

  @ApiPropertyOptional()
  certificationsNote: string | null;

  @ApiProperty({
    type: CareerFieldDto,
  })
  field: CareerFieldDto;

  @ApiProperty({
    enum: TargetLevel,
    isArray: true,
  })
  targetLevels: TargetLevel[];

  @ApiProperty({
    enum: CareerStatus,
  })
  status: CareerStatus;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    type: [CareerSkillDto],
  })
  skills: CareerSkillDto[];

  @ApiProperty({
    type: [OutlookDataDto],
  })
  outlook: OutlookDataDto[];

  @ApiPropertyOptional({
    type: CareerPathwaySummaryDto,
    nullable: true,
    description:
      'Summary of the associated pathway. Use the pathway ID to retrieve the full pathway.',
  })
  pathway: CareerPathwaySummaryDto | null;
}
