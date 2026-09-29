import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ type: String, nullable: true })
  sourceUrl: string | null;

  @ApiProperty()
  period: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal serialized as a string',
  })
  median: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal serialized as a string',
  })
  percentile25: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal serialized as a string',
  })
  percentile75: string | null;

  @ApiProperty({ type: String, nullable: true })
  currency: string | null;

  @ApiProperty({ type: String, nullable: true })
  payPeriod: string | null;

  @ApiProperty({ type: String, nullable: true })
  grossOrNet: string | null;

  @ApiProperty({ type: String, nullable: true })
  experienceLevel: string | null;

  @ApiProperty({ type: Number, nullable: true })
  baseYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  baseValue: number | null;

  @ApiProperty({ type: Number, nullable: true })
  projectedYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  projectedValue: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal serialized as a string',
  })
  growthPercent: string | null;

  @ApiProperty({
    enum: Demand,
    nullable: true,
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

  @ApiProperty({ type: String, nullable: true })
  typicalEducationNote: string | null;

  @ApiProperty({ type: String, nullable: true })
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

  @ApiProperty({ type: Date, nullable: true })
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

  @ApiProperty({
    type: CareerPathwaySummaryDto,
    nullable: true,
    description:
      'Summary of the associated pathway. Use the pathway ID to retrieve the full pathway.',
  })
  pathway: CareerPathwaySummaryDto | null;
}
