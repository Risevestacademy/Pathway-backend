import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ResourceCostStatus,
  ResourceType,
} from '../../../../generated/prisma/client';
import { CareerSkillDto } from '../../dto/career-detail.dto';

export class PathwayResourceDto {
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

  @ApiProperty({ type: [CareerSkillDto] })
  skills: CareerSkillDto[];
}

export class PathwayStepDto {
  @ApiProperty()
  id: string;

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

  @ApiProperty()
  order: number;

  @ApiProperty({ type: [CareerSkillDto] })
  skills: CareerSkillDto[];

  @ApiProperty({ type: [PathwayResourceDto] })
  resources: PathwayResourceDto[];
}

export class CareerPathwayDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  careerId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ type: [PathwayStepDto] })
  steps: PathwayStepDto[];
}

export class CareerPathwayResponseDto {
  @ApiPropertyOptional({ type: CareerPathwayDto, nullable: true })
  pathway: CareerPathwayDto | null;
}
