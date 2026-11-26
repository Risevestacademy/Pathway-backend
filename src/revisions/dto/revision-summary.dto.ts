import { ApiProperty } from '@nestjs/swagger';
import { ContentType, RevisionStatus } from '../../generated/prisma/client';

/**
 * Light per-revision view. Used in every session response.
 *
 * Deliberately snapshot-free. The frontend reads content from the diff
 * endpoint (`GET /admin/sessions/:id/diff`); raw snapshots are not exposed in
 */
export class RevisionSummaryDto {
  @ApiProperty({ example: 'a3f2c1d4-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  contentType!: ContentType;

  @ApiProperty({
    example: 'b7e2d1a9-0000-0000-0000-000000000000',
    description:
      'The content root being changed. For a new career, this is the ' +
      "session's contextId (the DRAFT Career row created at createSession).",
  })
  contentId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.DRAFT })
  status!: RevisionStatus;

  @ApiProperty({
    example: 3,
    description:
      'The publish-event version this draft was anchored against. ' +
      'A revision is stale when baseVersion < currentVersion.',
  })
  baseVersion!: number;

  @ApiProperty({ example: '2026-10-30T12:00:00.000Z' })
  updatedAt!: Date;
}
