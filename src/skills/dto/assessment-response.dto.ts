import { ApiProperty } from '@nestjs/swagger';
import { UserSkillStatus } from '../../generated/prisma/client';

export class AssessmentSkillDto {
  @ApiProperty()
  skillId: string;

  @ApiProperty()
  skillName: string;

  @ApiProperty({ enum: UserSkillStatus })
  status: UserSkillStatus;

  @ApiProperty({ type: Number, nullable: true })
  rating: number | null;
}

export class AssessmentStageDto {
  @ApiProperty()
  stageId: string;

  @ApiProperty()
  stageTitle: string;

  @ApiProperty()
  stageOrder: number;

  @ApiProperty({ type: [AssessmentSkillDto] })
  skills: AssessmentSkillDto[];
}

export class AssessmentResponseDto {
  @ApiProperty()
  careerId: string;

  @ApiProperty()
  pathwayId: string;

  @ApiProperty({ type: [AssessmentStageDto] })
  stages: AssessmentStageDto[];
}
