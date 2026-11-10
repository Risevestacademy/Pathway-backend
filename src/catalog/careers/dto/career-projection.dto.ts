import { ApiProperty } from '@nestjs/swagger';
import { Demand, OutlookType } from '../../../generated/prisma/client';

export class OutlookItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: OutlookType })
  type: OutlookType;

  @ApiProperty({ example: 'United States' })
  geography: string;

  @ApiProperty({ nullable: true })
  sourceId: string | null;

  @ApiProperty({ example: 'May 2024' })
  period: string;

  @ApiProperty({ nullable: true, type: String, example: '92750.00' })
  median: string | null;

  @ApiProperty({ nullable: true, type: String })
  percentile25: string | null;

  @ApiProperty({ nullable: true, type: String })
  percentile75: string | null;

  @ApiProperty({ nullable: true, example: 'USD' })
  currency: string | null;

  @ApiProperty({ nullable: true, example: 'year' })
  payPeriod: string | null;

  @ApiProperty({ nullable: true, example: 'gross' })
  grossOrNet: string | null;

  @ApiProperty({ nullable: true, example: 'entry-level' })
  experienceLevel: string | null;

  @ApiProperty({ nullable: true })
  baseYear: number | null;

  @ApiProperty({ nullable: true })
  baseValue: number | null;

  @ApiProperty({ nullable: true })
  projectedYear: number | null;

  @ApiProperty({ nullable: true })
  projectedValue: number | null;

  @ApiProperty({ nullable: true, type: String, example: '8.00' })
  growthPercent: string | null;

  @ApiProperty({ nullable: true, enum: Demand })
  demandLevel: Demand | null;
}
