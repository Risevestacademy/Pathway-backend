import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CareerListItemDto {
  @ApiProperty({ description: 'Unique identifier of the career' })
  id: string;

  @ApiProperty({ description: 'URL-friendly slug for the career' })
  slug: string;

  @ApiProperty({ description: 'Title of the career' })
  title: string;

  @ApiPropertyOptional({ description: 'Short description of the career' })
  shortDescription: string | null;
}
