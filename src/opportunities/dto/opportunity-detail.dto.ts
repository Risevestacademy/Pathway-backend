import { ApiProperty } from '@nestjs/swagger';
import type { OpportunityStatus } from '../opportunities.rules';
import { OpportunityType } from '../../generated/prisma/client';

const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'OPEN',
  'CLOSING_SOON',
  'CLOSED',
  'ROLLING',
];

export class OpportunityCareerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;
}

export class OpportunitySkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class OpportunityDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OpportunityType })
  type: OpportunityType;

  @ApiProperty()
  organisation: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  description: string;

  @ApiProperty({
    enum: OPPORTUNITY_STATUSES,
    description:
      'Derived from the deadline. CLOSED listings are still returned so the client can show its closed banner.',
  })
  status: OpportunityStatus;

  @ApiProperty({ type: [String] })
  responsibilities: string[];

  @ApiProperty({ type: [String] })
  audience: string[];

  @ApiProperty({ type: String, nullable: true })
  pay: string | null;

  @ApiProperty({ type: String, nullable: true })
  duration: string | null;

  @ApiProperty({ type: Date, nullable: true })
  startDate: Date | null;

  @ApiProperty()
  applyUrl: string;

  @ApiProperty({ type: Date, nullable: true })
  deadline: Date | null;

  @ApiProperty({ type: [OpportunityCareerDto] })
  careers: OpportunityCareerDto[];

  @ApiProperty({ type: [OpportunitySkillDto] })
  skills: OpportunitySkillDto[];
}
