import { ApiProperty } from '@nestjs/swagger';
import { SkillImportance } from '../../../generated/prisma/client';

export class CareerSkillDto {
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

  @ApiProperty({ nullable: true })
  roleSummary: string | null;

  @ApiProperty({ type: [String] })
  exampleActivities: string[];

  @ApiProperty({
    description: 'Banner background for the detail page',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({ type: [CareerSkillDto] })
  skills: CareerSkillDto[];

  @ApiProperty({
    description: 'Number of pathway steps ("Topics" in the UI)',
  })
  topicCount: number;

  @ApiProperty({
    description: 'Number of linked resources ("Projects" in the UI)',
  })
  resourceCount: number;
}
