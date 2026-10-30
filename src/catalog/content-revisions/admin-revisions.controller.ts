import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  HttpStatus,
  Post,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../../common';
import { Role } from '../../generated/prisma/client';
import { RevisionsService } from './content-revisions.service';
import { ReviewerDiffResponseDto } from './dto/reviewer-diff-response.dto';
import { RebaseRevisionResponseDto } from './dto/rebase-revision-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/revisions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @ApiOperation({
    summary: 'Preview the diff for a revision',
    description: [
      'Minimum role: REVIEWER.',
      '',
      'Returns a reviewer-shaped diff grouped by section: career fields, ' +
        'outlook, steps, resources. Each section has `changed`, `added`, ' +
        '`removed` and `moved` buckets. Sections with no changes are omitted.',
      '',
      'Read-only. The plan that backs this response is the same plan that ' +
        'submit, review, and publish use. Any divergence would let a reviewer ' +
        "approve something publish can't safely apply.",
      '',
      '**stale** — `true` means the live career changed since this revision ' +
        'was created. The reviewer should request a rebase before approving.',
      '',
      '**blockers** — hard stops. Non-empty means publish would fail. E.g. ' +
        'removing a step that learners have completed, missing required ' +
        'career fields, or an empty skills/steps list.',
      '',
      '**advisories** — soft warnings shown as info banners. Do not block ' +
        'approval.',
      '',
      'Field values are sent raw: decimals as strings (`"230000.00"`), ' +
        'arrays as arrays, foreign keys as both the raw UUID (`before` / ' +
        '`after`) and a human label (`beforeLabel` / `afterLabel`). The ' +
        'frontend formats currency and joins arrays.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 200,
    type: ReviewerDiffResponseDto,
    example: {
      revisionId: 'a3f2c1d4-0000-0000-0000-000000000000',
      title: 'UX Designer: salary range',
      submittedBy: 'Chidi E.',
      submittedAt: '5 hours ago',
      baseVersion: 3,
      liveVersion: 3,
      stale: false,
      blockers: [],
      advisories: [],
      sections: {
        career: {
          changed: [
            {
              field: 'title',
              label: 'Title',
              before: 'Frontend Engineer',
              after: 'Senior Frontend Engineer',
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
        outlook: {
          changed: [
            {
              field: 'sourceId',
              label: 'Source',
              before: 'a3f2c1d4-0000-0000-0000-000000000000',
              after: 'b7e2d1a9-0000-0000-0000-000000000000',
              beforeLabel: 'Jobberman salary guide 2025',
              afterLabel: 'Jobberman salary guide 2026',
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below REVIEWER' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @Get(':revisionId/diff')
  @MinRole(Role.REVIEWER)
  async getDiff(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewerDiffResponseDto> {
    return this.revisionsService.buildDiff(revisionId, user.id);
  }

  @ApiOperation({
    summary: 'Rebase a stale draft onto the current live version',
    description: [
      'Minimum role: EDITOR. Creator only — ADMIN does not bypass.',
      '',
      'Rebase re-anchors a DRAFT revision onto the current live career version. ' +
        "It does NOT merge: the editor's snapshot is preserved as-is, and only " +
        '`baseVersion` is moved forward. The editor then re-checks their draft ' +
        'against the new live state before submitting.',
      '',
      '**Fresh draft (baseVersion === live version):** returns 200 with ' +
        '`rebased: false`. No write, no event.',
      '',
      '**Stale draft:** writes the new `baseVersion`, returns 200 with ' +
        '`rebased: true`, emits `revision_rebased`.',
      '',
      '**IN_REVIEW:** 409 `INVALID_REVISION_STATE`. Recall first (ticket 12), ' +
        'then rebase.',
      '',
      '**Not the creator:** 403 `NOT_REVISION_CREATOR`.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 200,
    type: RebaseRevisionResponseDto,
    description:
      'Draft re-anchored (rebased: true) or already fresh (rebased: false).',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'The user is below EDITOR, or is not the revision creator',
  })
  @ApiResponse({
    status: 404,
    description: 'Revision (or its career) not found',
  })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_REVISION_STATE (not a draft) or CAREER_RETIRED (career is retired)',
  })
  @Post(':revisionId/rebase')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.EDITOR)
  async rebase(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RebaseRevisionResponseDto> {
    return this.revisionsService.rebaseRevision(revisionId, user.id);
  }
}
