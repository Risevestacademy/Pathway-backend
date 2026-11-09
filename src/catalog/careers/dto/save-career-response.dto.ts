import { ApiProperty } from '@nestjs/swagger';

export class SaveCareerResponseDto {
  @ApiProperty() careerId: string;

  @ApiProperty() savedAt: Date;
}
