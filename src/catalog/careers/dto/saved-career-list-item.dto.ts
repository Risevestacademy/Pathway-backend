import { ApiProperty } from '@nestjs/swagger';
import { CareerCardDto } from './career-card.dto';

export class SavedCareerListItemDto extends CareerCardDto {
  @ApiProperty({ description: 'When the user saved this career' })
  savedAt: Date;

  @ApiProperty({
    description: 'Whether this career has an active user pathway',
  })
  isActivePathway: boolean;

  @ApiProperty({ description: 'Whether this career has been retired' })
  isRetired: boolean;
}
