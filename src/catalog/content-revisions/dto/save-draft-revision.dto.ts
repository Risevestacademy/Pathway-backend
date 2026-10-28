import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  isUUID,
} from 'class-validator';
import {
  Demand,
  OutlookType,
  ResourceCostStatus,
  ResourceType,
  SkillImportance,
  TargetLevel,
} from '../../../generated/prisma/client';
import { SLUG_PATTERN } from '../../careers';
import {
  CAREER_SNAPSHOT_SCHEMA_VERSION,
  type CareerSnapshot,
  type CareerSnapshotCareer,
  type CareerSnapshotOutlook,
  type CareerSnapshotPathway,
  type CareerSnapshotResource,
  type CareerSnapshotSkill,
  type CareerSnapshotStep,
  isTempId,
} from '../career-snapshot.types';

const DECIMAL_15_2 = /^-?\d{1,13}(\.\d{1,2})?$/;
const DECIMAL_5_2 = /^-?\d{1,3}(\.\d{1,2})?$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

const notNull = (_: object, value: unknown) => value !== null;

const IsEntityRef = (each = false) =>
  ValidateBy(
    {
      name: 'isEntityRef',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && (isUUID(value) || isTempId(value)),
        defaultMessage: () =>
          `${each ? 'each value' : '$property'} must be a UUID or a temporary id such as new-1`,
      },
    },
    { each },
  );

const NullableString = (max: number) =>
  applyDecorators(ValidateIf(notNull), IsString(), Length(1, max));

const NullableDecimal = (pattern: RegExp) =>
  applyDecorators(
    ValidateIf(notNull),
    IsString(),
    Matches(pattern, { message: '$property must be a decimal string' }),
  );

const NullableInt = () => applyDecorators(ValidateIf(notNull), IsInt());

export class SnapshotCareerDto implements CareerSnapshotCareer {
  @ApiProperty({ example: 'DevOps Engineer', minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ example: 'devops-engineer', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase letters, digits and single hyphens',
  })
  slug: string;

  @ApiProperty({
    example: 'Automates how software is built, tested and deployed.',
    minLength: 1,
    maxLength: 300,
  })
  @IsString()
  @Length(1, 300)
  description: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  roleSummary: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf(notNull)
  @IsUUID()
  fieldId: string | null;

  @ApiProperty({ enum: TargetLevel, isArray: true })
  @IsArray()
  @IsEnum(TargetLevel, { each: true })
  targetLevels: TargetLevel[];

  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  exampleActivities: string[];

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  typicalEducationNote: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  certificationsNote: string | null;
}

export class SnapshotPathwayDto implements CareerSnapshotPathway {
  @ApiProperty({ example: 'DevOps Roadmap', minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  description: string | null;
}

export class SnapshotStepDto implements CareerSnapshotStep {
  @ApiProperty({
    example: 'new-1',
    description: 'A live step UUID, or a temporary id for a new step.',
  })
  @IsEntityRef()
  id: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;

  @ApiProperty({ example: 'Learn Linux basics', minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  description: string | null;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  learningObjective: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  prerequisites: string | null;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  expectedActivity: string;

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  skillIds: string[];

  @ApiProperty({
    type: [String],
    maxItems: 50,
    description: 'Shared resource UUIDs, or temporary ids of draft resources.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsEntityRef(true)
  resourceIds: string[];
}

export class SnapshotSkillDto implements CareerSnapshotSkill {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skillId: string;

  @ApiProperty({ enum: SkillImportance })
  @IsEnum(SkillImportance)
  importance: SkillImportance;
}

export class SnapshotOutlookDto implements CareerSnapshotOutlook {
  @ApiProperty({ example: 'new-1' })
  @IsEntityRef()
  id: string;

  @ApiProperty({ enum: OutlookType })
  @IsEnum(OutlookType)
  type: OutlookType;

  @ApiProperty({ example: 'Lagos, Nigeria', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  geography: string;

  @ApiProperty({ example: '2026', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  period: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf(notNull)
  @IsUUID()
  sourceId: string | null;

  @ApiProperty({ type: String, nullable: true, example: '65000.00' })
  @NullableDecimal(DECIMAL_15_2)
  median: string | null;

  @ApiProperty({ type: String, nullable: true })
  @NullableDecimal(DECIMAL_15_2)
  percentile25: string | null;

  @ApiProperty({ type: String, nullable: true })
  @NullableDecimal(DECIMAL_15_2)
  percentile75: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 10 })
  @NullableString(10)
  currency: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 50 })
  @NullableString(50)
  payPeriod: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 50 })
  @NullableString(50)
  grossOrNet: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  @NullableString(100)
  experienceLevel: string | null;

  @ApiProperty({ type: Number, nullable: true })
  @NullableInt()
  baseYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @NullableInt()
  baseValue: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @NullableInt()
  projectedYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @NullableInt()
  projectedValue: number | null;

  @ApiProperty({ type: String, nullable: true, example: '8.00' })
  @NullableDecimal(DECIMAL_5_2)
  growthPercent: string | null;

  @ApiProperty({ enum: Demand, nullable: true })
  @ValidateIf(notNull)
  @IsEnum(Demand)
  demandLevel: Demand | null;
}

export class SnapshotResourceDto implements CareerSnapshotResource {
  @ApiProperty({ example: 'new-1' })
  @IsEntityRef()
  id: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  @NullableString(2000)
  description: string | null;

  @ApiProperty({ example: 'https://example.com/course' })
  @IsUrl()
  url: string;

  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  provider: string;

  @ApiProperty({ enum: ResourceCostStatus })
  @IsEnum(ResourceCostStatus)
  costStatus: ResourceCostStatus;

  @ApiProperty({ type: String, nullable: true, example: '150.00' })
  @NullableDecimal(DECIMAL)
  certificationCost: string | null;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  curationRationale: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsISO8601({ strict: true })
  lastCheckedDate: string;
}

export class SaveDraftRevisionDto implements CareerSnapshot {
  @ApiProperty({ enum: [CAREER_SNAPSHOT_SCHEMA_VERSION], example: 1 })
  @IsIn([CAREER_SNAPSHOT_SCHEMA_VERSION])
  schemaVersion: typeof CAREER_SNAPSHOT_SCHEMA_VERSION;

  @ApiProperty({ type: SnapshotCareerDto })
  @IsObject()
  @ValidateNested()
  @Type(() => SnapshotCareerDto)
  career: SnapshotCareerDto;

  @ApiProperty({ type: SnapshotPathwayDto, nullable: true })
  @ValidateIf(notNull)
  @IsObject()
  @ValidateNested()
  @Type(() => SnapshotPathwayDto)
  pathway: SnapshotPathwayDto | null;

  @ApiProperty({ type: [SnapshotStepDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SnapshotStepDto)
  steps: SnapshotStepDto[];

  @ApiProperty({ type: [SnapshotSkillDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SnapshotSkillDto)
  skills: SnapshotSkillDto[];

  @ApiProperty({ type: [SnapshotOutlookDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SnapshotOutlookDto)
  outlook: SnapshotOutlookDto[];

  @ApiProperty({ type: [SnapshotResourceDto], maxItems: 300 })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => SnapshotResourceDto)
  resources: SnapshotResourceDto[];
}
