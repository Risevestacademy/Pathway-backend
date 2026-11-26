import { ApiProperty } from '@nestjs/swagger';
import { ReviewDecision, RevisionStatus } from '../../generated/prisma/client';

/**
 * Result of POST /admin/sessions/:id/review.
 *
 * Session-scoped review: `revisionId` is always null (the CHECK constraint
 * enforces exactly one of revisionId/sessionId on the Review row).
 */
export class ReviewResponseDto {
  @ApiProperty({ example: 'f6a7b8c9-0000-0000-0000-000000000000' })
  reviewId!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  revisionId!: null;

  @ApiProperty({ enum: ReviewDecision, example: ReviewDecision.APPROVED })
  decision!: ReviewDecision;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Looks good.',
    description: 'Echoed back from the request. Never logged.',
  })
  note!: string | null;

  @ApiProperty({
    enum: RevisionStatus,
    example: RevisionStatus.APPROVED,
    description:
      'The session status after the decision. APPROVED, REJECTED, or ' +
      "CHANGES_REQUESTED. Never PUBLISHED (that is publish's job).",
  })
  sessionStatus!: RevisionStatus;

  @ApiProperty({ example: '2026-10-30T13:00:00.000Z' })
  createdAt!: Date;
}
