import { ApiProperty } from '@nestjs/swagger';
import { CareerSkillDto } from '../../dto/career-detail.dto';

export class PathwayStepListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [CareerSkillDto] })
  skills: CareerSkillDto[];
}
