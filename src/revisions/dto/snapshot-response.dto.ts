import { ApiProperty } from '@nestjs/swagger';
import { ContentType } from '../../generated/prisma/client';

/**
 * One content model's saved snapshot.
 *
 * `contentId` may be a temp ID (`new-<n>`) for a model created in this
 * session. The snapshot's shape is defined by the strategy for `contentType`;
 * this DTO does not interpret it.
 */
export class SessionSnapshotDto {
  @ApiProperty({
    example: 'a3f2c1d4-0000-0000-0000-000000000000',
    description: 'The ContentRevision.id this snapshot belongs to.',
  })
  revisionId!: string;

  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  contentType!: ContentType;

  @ApiProperty({
    example: 'b7e2d1a9-0000-0000-0000-000000000000',
    description:
      'The content root this revision changes. May be a temp ID (`new-<n>`) ' +
      'when the editor created the model in this session.',
  })
  contentId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'The exact snapshot the editor saved via saveDraft. Shape is defined ' +
      'by the strategy for `contentType`; this DTO does not interpret it.',
  })
  snapshot!: Record<string, unknown>;

  @ApiProperty({
    example: '2026-10-30T12:00:00.000Z',
    description: 'Last time this revision was saved.',
  })
  updatedAt!: Date;
}

/**
 * GET /admin/sessions/:sessionId/snapshots
 *
 * The raw saved snapshots for a session, one per revision.
 *
 * Use this to populate edit forms when resuming a draft, to seed a new session
 * from a CHANGES_REQUESTED one, or to inspect a historical session. For a
 * reviewer's change report, use GET /admin/sessions/:id/diff instead — that is
 * the derived diff, not the raw state.
 */
export class SnapshotResponseDto {
  @ApiProperty({ example: 'c1e2d3f4-0000-0000-0000-000000000000' })
  sessionId!: string;

  @ApiProperty({
    type: [SessionSnapshotDto],
    description:
      'One entry per revision in the session, ordered by contentType then ' +
      'contentId. Empty when the session has no revisions saved yet.',
  })
  snapshots!: SessionSnapshotDto[];
}
