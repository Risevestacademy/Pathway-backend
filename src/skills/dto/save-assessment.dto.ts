import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UserSkillStatus } from '../../generated/prisma/client';

export class AssessmentSkillSaveDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skillId: string;

  @ApiProperty({ enum: UserSkillStatus })
  @IsEnum(UserSkillStatus)
  status: UserSkillStatus;

  @ApiProperty({
    type: Number,
    nullable: true,
    required: false,
    description: 'Only allowed when status = HAVE (1–5).',
  })
  @ValidateIf((dto: AssessmentSkillSaveDto) => dto.rating !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class SaveAssessmentDto {
  @ApiProperty({ type: [AssessmentSkillSaveDto] })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentSkillSaveDto)
  skills: AssessmentSkillSaveDto[];
}

export class AssessmentStatsDto {
  @ApiProperty()
  have: number;

  @ApiProperty()
  dontHave: number;

  @ApiProperty()
  notSure: number;
}

export class SkillGapDto {
  @ApiProperty({ format: 'uuid' })
  skillId: string;

  @ApiProperty()
  skillName: string;

  @ApiProperty({ format: 'uuid' })
  stepId: string;

  @ApiProperty()
  stepTitle: string;

  @ApiProperty()
  stepOrder: number;
}

export class SaveAssessmentResponseDto {
  @ApiProperty()
  updated: number;

  @ApiProperty()
  allGapsClosed: boolean;

  @ApiProperty({ type: String, nullable: true })
  startStepId: string | null;

  @ApiProperty({ type: String, nullable: true })
  startStepTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  startStepDescription: string | null;

  @ApiProperty({ type: AssessmentStatsDto })
  stats: AssessmentStatsDto;

  @ApiProperty({ type: [SkillGapDto] })
  gaps: SkillGapDto[];
}
