import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CareerSkillDto } from '../../careers/dto/career-detail.dto';
import { PathwayStepStatus } from '../../../generated/prisma/client';

export class ActivePathwayCareerDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() roleSummary: string;
  @ApiProperty() retired: boolean;
}

export class ActivePathwaySummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
}

export class ActivePathwayProgressDto {
  @ApiProperty() completed: number;
  @ApiProperty() total: number;
  @ApiProperty() percentage: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nextStepId:
    string | null;
  @ApiProperty() selfReported: boolean;
}

export class ActivePathwayStepDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() title: string;
  @ApiProperty({ type: [CareerSkillDto] }) skills: CareerSkillDto[];
  @ApiProperty({ enum: PathwayStepStatus }) status: PathwayStepStatus;
}

export class ActivePathwayResponseDto {
  @ApiPropertyOptional({ type: ActivePathwayCareerDto, nullable: true })
  career: ActivePathwayCareerDto | null;

  @ApiPropertyOptional({ type: ActivePathwaySummaryDto, nullable: true })
  pathway: ActivePathwaySummaryDto | null;

  @ApiPropertyOptional({ type: ActivePathwayProgressDto, nullable: true })
  progress: ActivePathwayProgressDto | null;

  @ApiProperty({ type: [ActivePathwayStepDto] })
  steps: ActivePathwayStepDto[];
}
