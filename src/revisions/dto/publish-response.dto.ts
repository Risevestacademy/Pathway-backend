import { ApiProperty } from '@nestjs/swagger';
import { ContentType, RevisionStatus } from '../../generated/prisma/client';

/**
 * One applied revision in a publish.
 *
 * `realId` is present only when this publish CREATED the root (the strategy's
 * apply returned an entry in createdIds for this contentId). For updates,
 * `realId` is omitted. The frontend uses `realId` to reconcile temp IDs it
 * sent in the draft.
 */
export class PublishedRevisionDto {
  @ApiProperty({ enum: ContentType, example: ContentType.RESOURCE })
  contentType!: ContentType;

  @ApiProperty({
    example: 'new-1',
    description:
      'The id the draft used for this root. May be a temp id (`new-*`) ' +
      'when the draft created the root.',
  })
  contentId!: string;

  @ApiProperty({
    type: String,
    required: false,
    example: 'b7e2d1a9-0000-0000-0000-000000000000',
    description: 'Present only when the root was created by this publish.',
  })
  realId?: string;
}

/**
 * POST /admin/sessions/:id/publish
 *
 * `published` is in the order revisions were applied (publish order), so the
 * frontend can show "resource created, then step created, then career
 * updated" in sequence.
 */
export class PublishResponseDto {
  @ApiProperty({ example: 'c1e2d3f4-0000-0000-0000-000000000000' })
  sessionId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.PUBLISHED })
  status!: RevisionStatus;

  @ApiProperty({ example: '2026-10-30T13:30:00.000Z' })
  publishedAt!: Date;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { 'new-1': 'b7e2d1a9-0000-0000-0000-000000000000' },
    description:
      'Full temp-ID → real-ID map accumulated across this publish. ' +
      'Includes entries for roots created by this session.',
  })
  idMap!: Record<string, string>;

  @ApiProperty({ type: [PublishedRevisionDto] })
  published!: PublishedRevisionDto[];
}
