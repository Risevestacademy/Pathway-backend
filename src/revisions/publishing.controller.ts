import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../common';
import { Role } from '../generated/prisma/client';
import { PublishingService } from './publishing.service';
import {
  CreateSessionDto,
  DiscardResponseDto,
  FindOpenSessionQueryDto,
  PublishResponseDto,
  RebaseResponseDto,
  ReviewResponseDto,
  ReviewSessionDto,
  RevisionSessionResponseDto,
  SaveDraftDto,
  SaveDraftResponseDto,
  SessionDiffResponseDto,
  SnapshotResponseDto,
  SubmitResponseDto,
} from './dto';

@ApiTags('Admin - Sessions')
@ApiBearerAuth()
@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Create a revision session',
    description: [
      'Minimum role: EDITOR.',
      '',
      'Two modes:',
      '',
      '- **Open against an existing context root.** Send `contextId` as a UUID. ' +
        'For `contextType: "CAREER"`, the Career row must already exist.',
      '',
      '- **Create a new context root.** Send `contextId: null` and ' +
        '`initialSnapshot` with a complete snapshot (title, slug, description, ' +
        'fieldId at minimum for a career). The service creates a DRAFT Career ' +
        'row seeded from the snapshot and stores its UUID as the session ' +
        'contextId. The snapshot is NOT saved as a revision; the first ' +
        '`saveDraft` does that.',
      '',
      'A user has at most one open session per context. If one already exists, ' +
        'the response is `409 SESSION_ALREADY_OPEN` with `details.sessionId`.',
    ].join('\n'),
  })
  @ApiResponse({ status: 201, type: RevisionSessionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Bad request. `VALIDATION_FAILED` (initialSnapshot failed validation or ' +
      'was missing with contextId: null), or `UNSUPPORTED_CONTENT_TYPE`.',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({
    status: 404,
    description: 'contextId was provided but the root row does not exist',
  })
  @ApiResponse({
    status: 409,
    description:
      'SESSION_ALREADY_OPEN (details.sessionId identifies the open session)',
  })
  @Post()
  @MinRole(Role.EDITOR)
  createSession(
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevisionSessionResponseDto> {
    return this.publishing.createSession(dto, user.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // GET /admin/sessions
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: "Find the current user's open DRAFT session for a context",
    description: [
      'Minimum role: EDITOR.',
      '',
      'Scoped to the authenticated user (the creator). Returns the open DRAFT ' +
        'session for the given `(contextType, contextId)`, or `null` if there ' +
        'is none. `null` is a valid answer, not a 404 — the frontend uses this ' +
        'to detect "you have an unsaved draft" on the editor screen.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 200,
    type: RevisionSessionResponseDto,
    description: 'The open DRAFT session, or null if none exists.',
    isArray: false,
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @Get()
  @MinRole(Role.EDITOR)
  findOpenSession(
    @Query() query: FindOpenSessionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevisionSessionResponseDto | null> {
    return this.publishing.findOpenSession(query, user.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // GET /admin/sessions/:sessionId
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Get a revision session and its revision summaries',
    description: [
      'Creator or REVIEWER+. Returns the session with its revisions ' +
        '(summaries only — no snapshots). Use `GET .../diff` to see the actual ' +
        'changes.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: RevisionSessionResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — not the creator and below REVIEWER',
  })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @Get(':sessionId')
  @MinRole(Role.EDITOR)
  getSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevisionSessionResponseDto> {
    return this.publishing.getSession(sessionId, {
      id: user.id,
      role: user.role,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions/:sessionId/draft
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Save the session draft (batch, replace semantics)',
    description: [
      'Minimum role: EDITOR.',
      '',
      'Replace semantics: the payload is the complete set of drafts for the ' +
        'session. Revisions not in the payload are deleted in the same ' +
        'transaction (ADR-2). There is no separate delete-revision endpoint.',
      '',
      'Validation warnings are returned but do NOT fail the save. Submit ' +
        'hard-fails on them. The same `strategy.validate` runs in both places; ' +
        'only the enforcement differs.',
      '',
      'Session must be in DRAFT. Save never touches the live tables.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: SaveDraftResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Body failed validation, or a contentType has no registered strategy ' +
      '(UNSUPPORTED_CONTENT_TYPE).',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'INVALID_SESSION_STATE — session is not DRAFT',
  })
  @Post(':sessionId/draft')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.EDITOR)
  saveDraft(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaveDraftResponseDto> {
    return this.publishing.saveDraft(sessionId, dto, user.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions/:sessionId/submit
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Submit a DRAFT session for review',
    description: [
      'Minimum role: EDITOR.',
      '',
      'Moves the session (and every revision in it) from DRAFT to IN_REVIEW ' +
        'in one transaction. Sets `submittedAt`.',
      '',
      '**All-or-nothing.** If any revision fails structural validation, has a ' +
        'plan blocker, or is stale, nothing transitions:',
      '',
      '- `400 VALIDATION_FAILED` — per-revision problems.',
      '- `400 PLAN_BLOCKED` — per-revision blockers (e.g. a removed step with ' +
        'learner progress).',
      '- `409 SESSION_STALE` — one or more revisions are behind the current ' +
        'version of their root. Rebase and re-check.',
      '',
      'Session must be in DRAFT and contain at least one revision.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: SubmitResponseDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED or PLAN_BLOCKED',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'INVALID_SESSION_STATE (not DRAFT or empty) or SESSION_STALE',
  })
  @Post(':sessionId/submit')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.EDITOR)
  submit(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubmitResponseDto> {
    return this.publishing.submit(sessionId, {
      id: user.id,
      role: user.role,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // GET /admin/sessions/:sessionId/diff
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Preview the reviewer diff for a session',
    description: [
      'Creator or REVIEWER+. Returns the same plan that submit, review, and ' +
        'publish use, rendered for review. Any divergence would let a ' +
        'reviewer approve something publish cannot safely apply.',
      '',
      '**stale** — `true` if ANY revision is behind its root. Rebase before ' +
        'approving.',
      '',
      '**blockers** — hard stops. Non-empty means publish would fail.',
      '',
      '**advisories** — soft warnings shown as info banners. Do not block ' +
        'approval.',
      '',
      '**sections** — an array of `SectionChanges`, one per section that has ' +
        'changes. Multiple entries may share a section when different content ' +
        'types contribute; the frontend groups by `section` for display.',
      '',
      'Read-only. No writes. The `diff` call may query the DB (FK label ' +
        'resolution), so it runs inside a transaction.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: SessionDiffResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — not the creator and below REVIEWER',
  })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @Get(':sessionId/diff')
  @MinRole(Role.EDITOR)
  buildDiff(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionDiffResponseDto> {
    return this.publishing.buildDiff(sessionId, {
      id: user.id,
      role: user.role,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions/:sessionId/review
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Approve, reject, or request changes on a session in review',
    description: [
      'Minimum role: REVIEWER.',
      '',
      'Records a session-scoped Review (revisionId is always null) and sets ' +
        'the session (and its revisions) to APPROVED, REJECTED, or ' +
        'CHANGES_REQUESTED. Approving publishes nothing; publishing is a ' +
        'separate step.',
      '',
      '**Separation of duties:** a reviewer cannot review their own session ' +
        'unless they are ADMIN. `403 SELF_REVIEW_NOT_ALLOWED`.',
      '',
      '**Staleness:** approving is blocked with `409 SESSION_STALE` if any ' +
        'revision is behind its root. Rejecting and requesting changes are ' +
        'always allowed.',
      '',
      '**The note is never logged or sent to analytics.** It lives only on the ' +
        'Review row. Capped at 2000 characters.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Body failed validation' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'Below REVIEWER, or SELF_REVIEW_NOT_ALLOWED',
  })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'INVALID_SESSION_STATE (not IN_REVIEW) or SESSION_STALE',
  })
  @Post(':sessionId/review')
  @MinRole(Role.REVIEWER)
  review(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: ReviewSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    return this.publishing.review(
      sessionId,
      { id: user.id, role: user.role },
      dto,
    );
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions/:sessionId/publish
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Publish an APPROVED session',
    description: [
      'Minimum role: PUBLISHER.',
      '',
      'Applies every revision in the session in publish order, in one ' +
        'transaction. Nothing changes on any failure path; the session stays ' +
        'APPROVED.',
      '',
      'Publish order is chosen by `isCreate` (`session.createdCareer`):',
      '',
      '- New career session → PUBLISH_ORDER_CREATE (parents before children).',
      '- Existing career session → PUBLISH_ORDER_UPDATE (leaves before parents).',
      '',
      '**Temp IDs** in each snapshot are rewritten before apply, driven by ' +
        '`strategy.tempIdFields`. The response includes `idMap` so the ' +
        'frontend can reconcile local `new-<n>` IDs.',
      '',
      '**On failure:** the transaction rolls back, the session stays APPROVED, ' +
        'and the error is surfaced (`SESSION_STALE`, `PLAN_BLOCKED`, ' +
        '`INVALID_SESSION_STATE`, or `INTERNAL_SERVER_ERROR` for an unknown ' +
        'content type in the publish order).',
      '',
      'The publisher may be the same person as the reviewer. Approval records ' +
        'intent; publish is the mechanical apply.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: PublishResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below PUBLISHER' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_SESSION_STATE, SESSION_STALE, or PLAN_BLOCKED (returned as 400 ' +
      'by the service; listed here for completeness — check the specific code)',
  })
  @Post(':sessionId/publish')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.PUBLISHER)
  publish(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublishResponseDto> {
    return this.publishing.publish(sessionId, {
      id: user.id,
      role: user.role,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // DELETE /admin/sessions/:sessionId
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Discard a DRAFT session',
    description: [
      'Minimum role: EDITOR.',
      '',
      'Deletes the session and cascades its revisions. If the session created ' +
        'the DRAFT Career row (`createdCareer: true`) and the Career is still ' +
        'in DRAFT, the Career row is deleted too. A promoted Career is never ' +
        'deleted by discard.',
      '',
      'Only DRAFT sessions can be discarded. IN_REVIEW, APPROVED, and ' +
        'PUBLISHED sessions are permanent history.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: DiscardResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'INVALID_SESSION_STATE (not DRAFT)',
  })
  @Delete(':sessionId')
  @MinRole(Role.EDITOR)
  discard(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DiscardResponseDto> {
    return this.publishing.discard(sessionId, user.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /admin/sessions/:sessionId/rebase
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Re-anchor a stale DRAFT session to the current versions',
    description: [
      'Minimum role: EDITOR. **Creator only** — ADMIN does not bypass.',
      '',
      'For each revision in the session, sets `baseVersion = currentVersion` ' +
        "for its root. Does NOT merge: the editor's snapshots are preserved " +
        'as-is; only the anchors move forward. The editor then re-checks their ' +
        'work against the new live state.',
      '',
      '**Fresh session** (no revision is stale): returns 200 with ' +
        '`rebased: false`. No write, no event.',
      '',
      '**Stale session:** writes new baseVersions, returns 200 with ' +
        '`rebased: true`, emits `revision_session_rebased`.',
      '',
      'Session must be DRAFT.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: RebaseResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'Below EDITOR, or NOT_SESSION_CREATOR',
  })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'INVALID_SESSION_STATE (not DRAFT)',
  })
  @Post(':sessionId/rebase')
  @HttpCode(HttpStatus.OK)
  @MinRole(Role.EDITOR)
  rebase(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RebaseResponseDto> {
    return this.publishing.rebase(sessionId, user.id);
  }

  // ───────────────────────────────────────────────────────────────────
  // GET /admin/sessions/:sessionId/snapshots
  // ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Get the raw saved snapshots for a session',
    description: [
      'Creator or REVIEWER+. Returns the exact snapshots the editor saved via ' +
        'saveDraft, one per revision, ordered by contentType then contentId.',
      '',
      '**Use this to populate edit forms when resuming a draft** — for ' +
        'example, after closing the tab, or when seeding a new session from a ' +
        'CHANGES_REQUESTED session. Also useful for inspecting a historical ' +
        'session.',
      '',
      '**Not for reviewer display** — use GET .../diff for the derived change ' +
        'report. The snapshot is the raw editor state, not a diff.',
      '',
      '**Temp IDs.** A model created in this session has `contentId: "new-<n>"`. ' +
        "The frontend reconciles against the publish response's `idMap`.",
      '',
      '**No status restriction.** Reads a session in any state, including ' +
        'PUBLISHED and CHANGES_REQUESTED.',
    ].join('\n'),
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: SnapshotResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — not the creator and below REVIEWER',
  })
  @ApiResponse({ status: 404, description: 'SESSION_NOT_FOUND' })
  @Get(':sessionId/snapshots')
  @MinRole(Role.EDITOR)
  getSnapshots(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SnapshotResponseDto> {
    return this.publishing.getSnapshots(sessionId, {
      id: user.id,
      role: user.role,
    });
  }
}
