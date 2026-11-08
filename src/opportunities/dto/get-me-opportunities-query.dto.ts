import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const ME_OPPORTUNITY_SCOPES = ['pathway'] as const;

export type MeOpportunityScope = (typeof ME_OPPORTUNITY_SCOPES)[number];

export class GetMeOpportunitiesQueryDto {
  @ApiProperty({
    enum: ME_OPPORTUNITY_SCOPES,
    example: 'pathway',
    description: "pathway: listings for the user's active career.",
  })
  @IsIn(ME_OPPORTUNITY_SCOPES)
  scope: MeOpportunityScope;
}
