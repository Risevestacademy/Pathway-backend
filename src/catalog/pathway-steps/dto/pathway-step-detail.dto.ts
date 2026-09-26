import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';

export class PathwayStepSkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class PathwayStepResourceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  url: string;

  @ApiProperty({ enum: ResourceType })
  type: ResourceType;

  @ApiProperty()
  provider: string;

  @ApiProperty({ enum: ResourceCostStatus })
  costStatus: ResourceCostStatus;

  @ApiPropertyOptional({ description: 'Decimal serialized as a string' })
  certificationCost: string | null;

  @ApiProperty()
  curationRationale: string;

  @ApiProperty()
  lastCheckedDate: Date;

  @ApiProperty({ type: [PathwayStepSkillDto] })
  skills: PathwayStepSkillDto[];
}

export class PathwayStepDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Pathway the step belongs to' })
  pathwayId: string;

  @ApiProperty({ description: 'Career the pathway belongs to' })
  careerId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  learningObjective: string;

  @ApiPropertyOptional()
  prerequisites: string | null;

  @ApiProperty()
  expectedActivity: string;

  @ApiProperty({ description: 'Position of the step within its pathway' })
  order: number;

  @ApiProperty({ type: [PathwayStepSkillDto] })
  skills: PathwayStepSkillDto[];

  @ApiProperty({ type: [PathwayStepResourceDto] })
  resources: PathwayStepResourceDto[];
}
