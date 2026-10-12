import { ApiProperty } from '@nestjs/swagger';

export class PathwayStepSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Position of the step within its pathway' })
  order: number;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;
}

export class PathwayMetadataDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Career the pathway belongs to' })
  careerId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Number of steps in this pathway' })
  stepCount: number;

  @ApiProperty({
    type: [PathwayStepSummaryDto],
    description:
      'Ordered slim step summaries. Resources and full step detail are ' +
      'served by GET /pathway-steps/:stepId.',
  })
  steps: PathwayStepSummaryDto[];
}
