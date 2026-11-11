import { ApiProperty } from '@nestjs/swagger';
import { CareerOverviewDto } from './career-overview.dto';
import { OutlookItemDto } from './career-projection.dto';
import { CareerRequirementsDto } from './career-requirements.dto';

export class CareerDetailResponseDto {
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
