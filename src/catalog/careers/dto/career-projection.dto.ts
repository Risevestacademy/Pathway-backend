import { ApiProperty } from '@nestjs/swagger';
import { Demand, OutlookType } from '../../../generated/prisma/client';

export class OutlookItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: OutlookType })
  type: OutlookType;

  @ApiProperty({ example: 'United States' })
  geography: string;

  @ApiProperty({ type: String, nullable: true })
  sourceId: string | null;

  @ApiProperty({ example: 'May 2024' })
  period: string;

  @ApiProperty({ type: String, nullable: true, example: '95000.00' })
  median: string | null;

  @ApiProperty({ type: String, nullable: true, example: '75000.00' })
  percentile25: string | null;

  @ApiProperty({ type: String, nullable: true, example: '120000.00' })
  percentile75: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'USD' })
  currency: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'year' })
  payPeriod: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'gross' })
  grossOrNet: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'entry-level' })
  experienceLevel: string | null;

  @ApiProperty({ type: Number, nullable: true })
  baseYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  baseValue: number | null;

  @ApiProperty({ type: Number, nullable: true })
  projectedYear: number | null;

  @ApiProperty({ type: Number, nullable: true })
  projectedValue: number | null;

  @ApiProperty({ nullable: true, type: String, example: '8.00' })
  growthPercent: string | null;

  @ApiProperty({ nullable: true, enum: Demand })
  demandLevel: Demand | null;
}
