import { ApiProperty } from '@nestjs/swagger';
import type {
  EntityChange,
  EntityRef,
  FieldChange,
  MovedEntity,
  PlanAdvisory,
  PlanBlocker,
  PlanSection,
  SectionChanges,
} from '../envelope/strategy.types';
import { ContentType } from '../../generated/prisma/client';

class FieldChangeDoc implements FieldChange {
  @ApiProperty({ example: 'title' })
  field!: string;

  @ApiProperty({ example: 'Title' })
  label!: string;

  @ApiProperty({ example: 'Frontend Engineer' })
  before!: unknown;

  @ApiProperty({ example: 'Senior Frontend Engineer' })
  after!: unknown;

  @ApiProperty({ required: false, example: 'Jobberman 2025' })
  beforeLabel?: string;

  @ApiProperty({ required: false, example: 'Jobberman 2026' })
  afterLabel?: string;
}

class EntityChangeDoc implements EntityChange {
  @ApiProperty({ example: 'b7e2d1a9-0000-0000-0000-000000000000' })
  entityId!: string;

  @ApiProperty({ example: 'UX Designer' })
  entityTitle!: string;

  @ApiProperty({ type: [FieldChangeDoc] })
  changes!: FieldChange[];
}

class EntityRefDoc implements EntityRef {
  @ApiProperty({ example: 'new-1' })
  id!: string;

  @ApiProperty({ example: 'Intro to Docker' })
  title!: string;
}

class MovedEntityDoc implements MovedEntity {
  @ApiProperty({ example: 'b7e2d1a9-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'Step 3: Build a portfolio' })
  title!: string;

  @ApiProperty({ example: 3 })
  fromOrder!: number;

  @ApiProperty({ example: 1 })
  toOrder!: number;
}

class SectionChangesDoc implements SectionChanges {
  @ApiProperty({
    example: 'steps',
    enum: [
      'career',
      'pathway',
      'stages',
      'steps',
      'stepSkills',
      'stepResources',
      'skills',
      'outlook',
      'sources',
      'resources',
      'tasks',
      'quiz',
      'quizQuestions',
    ] satisfies PlanSection[],
  })
  section!: PlanSection;

  @ApiProperty({ enum: ContentType, example: ContentType.PATHWAY_STEP })
  contentType!: ContentType;

  @ApiProperty({ type: [EntityChangeDoc] })
  changed!: EntityChange[];

  @ApiProperty({ type: [EntityRefDoc] })
  added!: EntityRef[];

  @ApiProperty({ type: [EntityRefDoc] })
  removed!: EntityRef[];

  @ApiProperty({ type: [MovedEntityDoc] })
  moved!: MovedEntity[];
}

class PlanBlockerDoc implements PlanBlocker {
  @ApiProperty({ example: 'STEP_HAS_PROGRESS' })
  code!: string;

  @ApiProperty({ example: 'Step 3 has 4 learners in progress' })
  message!: string;

  @ApiProperty({ example: 'steps' })
  section!: PlanSection;

  @ApiProperty({ required: false })
  entityId?: string;

  @ApiProperty({ required: false })
  entityTitle?: string;

  @ApiProperty({ required: false, example: 4 })
  learnersAffected?: number;
}

class PlanAdvisoryDoc implements PlanAdvisory {
  @ApiProperty({ example: 'SHARED_RESOURCE' })
  code!: string;

  @ApiProperty({ example: 'Used by 3 careers' })
  message!: string;

  @ApiProperty({ example: 'resources' })
  section!: PlanSection;

  @ApiProperty({ required: false })
  entityId?: string;
}

/**
 * GET /admin/sessions/:id/diff
 *
 * The reviewer diff. Derived from the same plan submit/publish use, so the
 * reviewer never approves something publish would reject.
 *
 * `sections` is an ARRAY of SectionChanges (one per section that has
 * changes), not an object keyed by section. Multiple entries may share a
 * section name when different content types contribute to the same section;
 * the frontend groups by `section` for display.
 *
 * `contextTitle` resolution: strategy.titleFor(snapshot) → Career.title query
 * → session.contextId fallback. Documented in the service.
 *
 * `stale` here is the session-level OR of per-revision staleness: true if
 * ANY revision's baseVersion < its root's currentVersion.
 */
export class SessionDiffResponseDto {
  @ApiProperty({ example: 'c1e2d3f4-0000-0000-0000-000000000000' })
  sessionId!: string;

  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  contextType!: ContentType;

  @ApiProperty({ example: 'd4e5f6a7-0000-0000-0000-000000000000' })
  contextId!: string;

  @ApiProperty({ example: 'Senior Frontend Engineer' })
  contextTitle!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Chidi E.',
    description: 'Full name of the session creator, or null if unset.',
  })
  submittedBy!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-30T12:30:00.000Z',
  })
  submittedAt!: Date | null;

  @ApiProperty({
    example: 3,
    description:
      'Max baseVersion across the session revisions. Zero-revision sessions ' +
      'report 0. This is the version the reviewer is approving against.',
  })
  baseVersion!: number;

  @ApiProperty({
    example: 3,
    description: 'Max currentVersion across the session revisions.',
  })
  liveVersion!: number;

  @ApiProperty({ example: false })
  stale!: boolean;

  @ApiProperty({ type: [PlanBlockerDoc] })
  blockers!: PlanBlocker[];

  @ApiProperty({ type: [PlanAdvisoryDoc] })
  advisories!: PlanAdvisory[];

  @ApiProperty({ type: [SectionChangesDoc] })
  sections!: SectionChanges[];
}
