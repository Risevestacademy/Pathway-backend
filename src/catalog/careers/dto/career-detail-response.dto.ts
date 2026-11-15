import { ApiProperty } from '@nestjs/swagger';
import { CareerOverviewDto } from './career-overview.dto';
import { OutlookItemDto } from './career-projection.dto';
import { CareerRequirementsDto } from './career-requirements.dto';

export class CareerDetailResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '3f6c1e2a-8b4d-4c7e-9a1f-2d5b6c7e8f90',
    description:
      'The id of the career’s pathway, or null when the career has no pathway.',
  })
  pathwayId: string | null;

  @ApiProperty({ type: CareerOverviewDto })
  overview: CareerOverviewDto;

  @ApiProperty({
    type: [OutlookItemDto],
    description: 'Outlook data in stored order.',
  })
  projection: OutlookItemDto[];

  @ApiProperty({ type: CareerRequirementsDto })
  requirements: CareerRequirementsDto;
}
