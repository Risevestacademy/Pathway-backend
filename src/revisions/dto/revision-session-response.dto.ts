import { ApiProperty } from '@nestjs/swagger';
import { ContentType, RevisionStatus } from '../../generated/prisma/client';
import { RevisionSummaryDto } from './revision-summary.dto';

/**
 * The session with its revisions (summaries only, no snapshots).
 */
export class RevisionSessionResponseDto {
  @ApiProperty({ example: 'c1e2d3f4-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  contextType!: ContentType;

  @ApiProperty({
    example: 'd4e5f6a7-0000-0000-0000-000000000000',
    description:
      'The career aggregate root. For a new career, a UUID generated at ' +
      'createSession; a DRAFT Career row exists with this id.',
  })
  contextId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.DRAFT })
  status!: RevisionStatus;

  @ApiProperty({ example: 'e5f6a7b8-0000-0000-0000-000000000000' })
  createdById!: string;

  @ApiProperty({ example: '2026-10-30T11:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-30T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-30T12:30:00.000Z',
    description: 'Set on submit, in the same transaction as the status flip.',
  })
  submittedAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Set on publish.',
  })
  publishedAt!: Date | null;

  @ApiProperty({ type: [RevisionSummaryDto] })
  revisions!: RevisionSummaryDto[];
}
