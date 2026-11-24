import { ApiProperty } from '@nestjs/swagger';
import { RevisionSummaryDto } from './revision-summary.dto';

/**
 * A RevisionSummary plus whether it was stale before the rebase.
 *
 * `baseVersion` reflects the post-rebase value. `wasStale === true` means
 * this revision's anchor actually moved.
 */
export class RebasedRevisionSummaryDto extends RevisionSummaryDto {
  @ApiProperty({
    example: true,
    description:
      'Whether this revision was stale before the rebase (baseVersion moved).',
  })
  wasStale!: boolean;
}

/**
 * POST /admin/sessions/:id/rebase
 *
 * Always returns the full set of revisions, post-rebase. When nothing was
 * stale, `rebased: false` and `revisions` is unchanged. `wasStale` per item
 * lets the UI say "rebased 2 of 3 revisions".
 */
export class RebaseResponseDto {
  @ApiProperty({ example: 'c1e2d3f4-0000-0000-0000-000000000000' })
  sessionId!: string;

  @ApiProperty({ example: true })
  rebased!: boolean;

  @ApiProperty({ type: [RebasedRevisionSummaryDto] })
  revisions!: RebasedRevisionSummaryDto[];
}
