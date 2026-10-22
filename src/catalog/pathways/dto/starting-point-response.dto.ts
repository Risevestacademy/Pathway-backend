import { ApiProperty } from '@nestjs/swagger';
import { ActivePathwayProgressDto } from './active-pathway-response.dto';

export class StartingPointResponseDto {
  @ApiProperty() careerId: string;

  @ApiProperty({ type: String, nullable: true })
  startStepId: string | null;

  @ApiProperty({
    type: ActivePathwayProgressDto,
    description: 'Updated progress for the saved pathway.',
  })
  progress: ActivePathwayProgressDto;
}
