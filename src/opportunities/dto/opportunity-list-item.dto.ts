import { ApiProperty } from '@nestjs/swagger';
import { OpportunityType } from '../../generated/prisma/client';
import type { OpportunityStatus } from '../opportunities.rules';

export const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'OPEN',
  'CLOSING_SOON',
  'CLOSED',
  'ROLLING',
];

export class OpportunityListItemDto {
  @ApiProperty({ example: '3f6c1e2a-8b4d-4c7e-9a1f-2d5b6c7e8f90' })
  id: string;

  @ApiProperty({ example: 'Backend Engineering Intern' })
  title: string;

  @ApiProperty({ enum: OpportunityType, example: OpportunityType.INTERNSHIP })
  type: OpportunityType;

  @ApiProperty({ example: 'Northwind Labs' })
  organisation: string;

  @ApiProperty({ example: 'Lagos, Nigeria' })
  location: string;

  @ApiProperty({
    enum: OPPORTUNITY_STATUSES,
    example: 'CLOSING_SOON',
    description:
      'CLOSING_SOON when the deadline is within 7 days; ROLLING when the deadline is unknown.',
  })
  status: OpportunityStatus;

  @ApiProperty({
    type: Date,
    nullable: true,
    example: '2026-11-20T23:59:00.000Z',
  })
  deadline: Date | null;

  @ApiProperty({
    example: 'Join the payments team for a 12-week internship building…',
    description:
      'The description, cut to 160 characters at a word boundary with "…".',
  })
  summary: string;
}
