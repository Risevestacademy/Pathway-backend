import { ApiProperty } from '@nestjs/swagger';
import { CareerCardDto } from './career-card.dto';

export class CareerListTotalsDto {
  @ApiProperty({
    description: 'Total number of published careers (UI label: "Pathways")',
    example: 7,
  })
  pathways: number;

  @ApiProperty({
    description:
      'Total number of pathway steps across all published careers (UI label: "Topics")',
    example: 57,
  })
  topics: number;

  @ApiProperty({
    description:
      'Total number of linked career resources across all published careers (UI label: "Projects")',
    example: 141,
  })
  resources: number;
}

export class CareerListResponseDto {
  @ApiProperty({
    type: CareerListTotalsDto,
    description: 'Catalog-wide totals. Not affected by level/interest filters.',
  })
  totals: CareerListTotalsDto;

  @ApiProperty({
    type: [CareerCardDto],
    description:
      'Published careers matching the filters, ordered by title. Empty array if no matches.',
  })
  items: CareerCardDto[];
}
