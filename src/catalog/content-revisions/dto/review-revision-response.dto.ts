import { ApiProperty } from '@nestjs/swagger';
import {
  ReviewDecision,
  RevisionStatus,
} from '../../../generated/prisma/client';

export class ReviewRevisionResponseDto {
  @ApiProperty({ format: 'uuid', description: 'The review record.' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  revisionId: string;

  @ApiProperty({ enum: ReviewDecision })
  decision: ReviewDecision;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({
    enum: RevisionStatus,
    description: 'The revision status after this decision.',
  })
  revisionStatus: RevisionStatus;

  @ApiProperty()
  createdAt: Date;
}
