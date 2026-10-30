import { ApiProperty } from '@nestjs/swagger';
import {
  CareerStatus,
  Demand,
  OutlookType,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
  SkillImportance,
  TargetLevel,
} from '../../../generated/prisma/client';

export class AdminCareerListFieldDto {
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class AdminCareerListItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: CareerStatus }) status: CareerStatus;
  @ApiProperty() version: number;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: AdminCareerListFieldDto })
  field: AdminCareerListFieldDto;
}

export class AdminCareerListResponseDto {
  @ApiProperty({ type: [AdminCareerListItemDto] })
  items: AdminCareerListItemDto[];
  @ApiProperty({ example: 42 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
}

export class AdminCareerFieldDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class AdminSkillRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class AdminCareerSkillDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: SkillImportance }) importance: SkillImportance;
}

export class AdminSourceDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) url: string | null;
  @ApiProperty({ type: Date, nullable: true }) lastCheckedAt: Date | null;
}

export class AdminOutlookDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OutlookType }) type: OutlookType;
  @ApiProperty() geography: string;
  @ApiProperty() period: string;
  @ApiProperty({ type: String, nullable: true }) median: string | null;
  @ApiProperty({ type: String, nullable: true }) percentile25: string | null;
  @ApiProperty({ type: String, nullable: true }) percentile75: string | null;
  @ApiProperty({ type: String, nullable: true }) currency: string | null;
  @ApiProperty({ type: String, nullable: true }) payPeriod: string | null;
  @ApiProperty({ type: String, nullable: true }) grossOrNet: string | null;
  @ApiProperty({ type: String, nullable: true }) experienceLevel: string | null;
  @ApiProperty({ type: Number, nullable: true }) baseYear: number | null;
  @ApiProperty({ type: Number, nullable: true }) baseValue: number | null;
  @ApiProperty({ type: Number, nullable: true }) projectedYear: number | null;
  @ApiProperty({ type: Number, nullable: true }) projectedValue: number | null;
  @ApiProperty({ type: String, nullable: true }) growthPercent: string | null;
  @ApiProperty({ enum: Demand, nullable: true }) demandLevel: Demand | null;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: AdminSourceDto, nullable: true })
  source: AdminSourceDto | null;
}

export class AdminResourceDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() url: string;
  @ApiProperty({ enum: ResourceType }) type: ResourceType;
  @ApiProperty() provider: string;
  @ApiProperty({ enum: ResourceCostStatus }) costStatus: ResourceCostStatus;
  @ApiProperty({
    enum: ResourceStatus,
    description: 'Staff also see WITHDRAWN resources.',
  })
  status: ResourceStatus;
  @ApiProperty() lastCheckedDate: Date;
}

export class AdminPathwayStepDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() learningObjective: string;
  @ApiProperty({ type: String, nullable: true }) prerequisites: string | null;
  @ApiProperty() expectedActivity: string;
  @ApiProperty({ type: [AdminSkillRefDto] }) skills: AdminSkillRefDto[];
  @ApiProperty({ type: [AdminResourceDto] }) resources: AdminResourceDto[];
}

export class AdminPathwayDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: [AdminPathwayStepDto] }) steps: AdminPathwayStepDto[];
}

export class AdminCareerDetailDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: String, nullable: true }) roleSummary: string | null;
  @ApiProperty({ type: [String] }) exampleActivities: string[];
  @ApiProperty({ type: String, nullable: true }) typicalEducationNote:
    string | null;
  @ApiProperty({ type: String, nullable: true }) certificationsNote:
    string | null;
  @ApiProperty({ enum: TargetLevel, isArray: true })
  targetLevels: TargetLevel[];
  @ApiProperty({ enum: CareerStatus }) status: CareerStatus;
  @ApiProperty() version: number;
  @ApiProperty({ type: Date, nullable: true }) publishedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) publishedById: string | null;
  @ApiProperty({ type: Date, nullable: true }) reviewedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) reviewedById: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: AdminCareerFieldDto }) field: AdminCareerFieldDto;
  @ApiProperty({ type: [AdminCareerSkillDto] }) skills: AdminCareerSkillDto[];
  @ApiProperty({ type: [AdminOutlookDto] }) outlook: AdminOutlookDto[];
  @ApiProperty({ type: AdminPathwayDto, nullable: true })
  pathway: AdminPathwayDto | null;
}
