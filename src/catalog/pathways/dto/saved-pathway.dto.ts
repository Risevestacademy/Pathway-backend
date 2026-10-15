import { ApiProperty } from '@nestjs/swagger';

export class SavedPathwayCareerDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() retired: boolean;
}

export class SavedPathwayProgressDto {
  @ApiProperty() completed: number;
  @ApiProperty() total: number;
  @ApiProperty() percentage: number;
}

export class SavedPathwayDto {
  @ApiProperty({ type: SavedPathwayCareerDto })
  career: SavedPathwayCareerDto;

  @ApiProperty() isActive: boolean;

  @ApiProperty({ type: SavedPathwayProgressDto })
  progress: SavedPathwayProgressDto;
}
