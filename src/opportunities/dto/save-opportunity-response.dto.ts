import { ApiProperty } from '@nestjs/swagger';

export class SaveOpportunityResponseDto {
  @ApiProperty() opportunityId: string;

  @ApiProperty() savedAt: Date;
}
