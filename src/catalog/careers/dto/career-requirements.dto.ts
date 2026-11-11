import { ApiProperty } from '@nestjs/swagger';
import { ResourceCostStatus } from '../../../generated/prisma/client';

export class ResourceSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  provider: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ enum: ResourceCostStatus })
  costStatus: ResourceCostStatus;

  @ApiProperty({ type: Number, nullable: true })
  estimatedWeeks: number | null;

  @ApiProperty({ type: String, nullable: true })
  badgeImageUrl: string | null;
}

export class CareerRequirementsDto {
  @ApiProperty({ type: [ResourceSummaryDto] })
  courses: ResourceSummaryDto[];

  @ApiProperty({ type: [ResourceSummaryDto] })
  certifications: ResourceSummaryDto[];
}
