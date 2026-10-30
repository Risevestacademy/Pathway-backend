import { ApiProperty } from '@nestjs/swagger';
import { CareerStatus } from '../../../generated/prisma/client';

export class RetireCareerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CareerStatus, example: 'RETIRED' })
  status: CareerStatus;

  @ApiProperty({ description: 'Unchanged by retiring.' })
  version: number;

  @ApiProperty()
  updatedAt: Date;
}
