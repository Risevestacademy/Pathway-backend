import { ApiProperty } from '@nestjs/swagger';
import { CareerListItemDto } from './list-careers.dto';

export class SavedCareerListItemDto extends CareerListItemDto {
  @ApiProperty() savedAt: Date;

  @ApiProperty({
    description: "Whether this career is the user's active pathway",
  })
  isActivePathway: boolean;

  @ApiProperty({ description: 'Whether the career was retired after saving' })
  isRetired: boolean;
}
