import { ApiProperty } from '@nestjs/swagger';
import { SkillImportance } from '../../../generated/prisma/client';

export class CareerOverviewSkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillImportance })
  importance: SkillImportance;
}

export class CareerOverviewDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String, nullable: true })
  roleSummary: string | null;

  @ApiProperty({ type: [String] })
  exampleActivities: string[];

  @ApiProperty({
    description: 'Banner background for the detail page',
    type: String,
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({ type: [CareerOverviewSkillDto] })
  skills: CareerOverviewSkillDto[];

  @ApiProperty({
    description: 'Number of pathway steps ("Topics" in the UI)',
  })
  topicCount: number;

  @ApiProperty({
    description: 'Number of linked resources ("Projects" in the UI)',
  })
  resourceCount: number;
}
