import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  HttpStatus,
  Post,
  UseGuards,
  HttpCode,
  Body,
  Delete,
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
import { ReviewRevisionResponseDto } from './dto/review-revision-response.dto';
import { ReviewRevisionDto } from './dto/review-revision.dto';
import { RecallRevisionResponseDto } from './dto/recall-revision-response.dto';
import { DeleteRevisionResponseDto } from './dto/delete-revision-response.dto';

@ApiTags('Admin - Revisions')
@ApiBearerAuth()
@Controller('admin/revisions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @ApiOperation({
    summary: 'Preview the diff for a revision',
    description: [
      'REVIEWER+ can view any revision. EDITOR can view their own revisions ' +
        '(creator-only — ADMIN does not bypass this for other people’s drafts).',
      '',
      'Returns a reviewer-shaped diff grouped by section: career fields, ' +
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
  @ApiResponse({
    status: 403,
    description:
      'The user is below EDITOR, or is an EDITOR who is not the revision creator',
  })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @Get(':revisionId/diff')
  @MinRole(Role.EDITOR)
  async getDiff(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewerDiffResponseDto> {
    return this.revisionsService.buildDiff(revisionId, {
      id: user.id,
      role: user.role,
    });
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

  @ApiOperation({
    summary: 'Approve or reject a revision in review',
    description: [
      'Minimum role: REVIEWER.',
      '',
      'Records a review and sets the revision to APPROVED or REJECTED. ' +
        'Approving publishes nothing; publishing is a separate step.',
      '',
      '**Separation of duties:** a reviewer cannot review a revision they ' +
        'created, unless they are an ADMIN. Otherwise 403 `SELF_REVIEW_NOT_ALLOWED`.',
      '',
      '**Stale revisions:** approving is blocked with 409 `REVISION_STALE` when ' +
        'the live career changed since the revision was created. Rejecting is ' +
        'always allowed.',
      '',
      '**Not in review:** 409 `INVALID_REVISION_STATE`.',
    ].join('\n'),
  })
  @ApiResponse({ status: 201, type: ReviewRevisionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID, or the body failed validation',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description:
      'The user is below REVIEWER, or reviewed their own revision (SELF_REVIEW_NOT_ALLOWED)',
  })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_REVISION_STATE (not in review) or REVISION_STALE (approval of a stale revision)',
  })
  @Post(':revisionId/review')
  @MinRole(Role.REVIEWER)
  async review(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: ReviewRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewRevisionResponseDto> {
    return this.revisionsService.reviewRevision(
      revisionId,
      { id: user.id, role: user.role },
      dto,
    );
  }

  @ApiOperation({
    summary: 'Recall a revision from review to draft',
    description:
      'Minimum role: EDITOR. Creator only, unless ADMIN. Moves an IN_REVIEW revision back to DRAFT so the editor can save changes again. Past reviews are kept.',
  })
  @ApiResponse({ status: 200, type: RecallRevisionResponseDto })
  @ApiResponse({ status: 400, description: 'revisionId is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description:
      'The user is below EDITOR, or is not the revision creator and not an ADMIN (FORBIDDEN, code NOT_REVISION_CREATOR)',
  })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @ApiResponse({
    status: 409,
    description:
      'The revision is not in review (CONFLICT, code INVALID_REVISION_STATE)',
  })
  @Post(':revisionId/recall')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.EDITOR)
  async recall(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecallRevisionResponseDto> {
    return this.revisionsService.recallRevision(revisionId, {
      id: user.id,
      role: user.role,
    });
  }

  @ApiOperation({
    summary: 'Delete a draft revision',
    description:
      'Minimum role: EDITOR. Discards a DRAFT revision. The career is left in place, including a never-published one; deleting a career is a separate admin action. A revision that is in review or already decided cannot be deleted: 409 INVALID_REVISION_STATE.',
  })
  @ApiResponse({ status: 200, type: DeleteRevisionResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @ApiResponse({
    status: 409,
    description: 'The revision is not a draft (INVALID_REVISION_STATE)',
  })
  @Delete(':revisionId')
  @MinRole(Role.EDITOR)
  async deleteRevision(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeleteRevisionResponseDto> {
    return this.revisionsService.deleteDraftRevision(revisionId, user.id);
  }
}
