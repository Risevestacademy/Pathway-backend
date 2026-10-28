import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FieldChangeDto {
  @ApiProperty({ example: 'sourceId' })
  field!: string;

  @ApiProperty({ example: 'Source' })
  label!: string;

  @ApiProperty({
    description: 'Raw value. UUID for foreign keys, raw decimal for currency.',
    example: 'a3f2c1d4-…',
  })
  before!: unknown;

  @ApiProperty({ example: 'b7e2d1a9-…' })
  after!: unknown;

  @ApiPropertyOptional({
    description:
      'Human-readable label for the `before` value (e.g. a Source name).',
    example: 'Jobberman salary guide 2025',
  })
  beforeLabel?: string;

  @ApiPropertyOptional({ example: 'Jobberman salary guide 2026' })
  afterLabel?: string;
}

export class StepChangeDto {
  @ApiProperty({ example: 'a3f2c1d4-…' })
  id!: string;

  @ApiProperty({ example: 'Introduction to HTML' })
  title!: string;
}

export class MovedStepDto extends StepChangeDto {
  @ApiProperty({ example: 2 })
  fromOrder!: number;

  @ApiProperty({ example: 1 })
  toOrder!: number;
}

export class SectionChangesDto {
  @ApiProperty({ type: [FieldChangeDto] })
  changed!: FieldChangeDto[];

  @ApiProperty({ type: [StepChangeDto] })
  added!: StepChangeDto[];

  @ApiProperty({ type: [StepChangeDto] })
  removed!: StepChangeDto[];

  @ApiProperty({ type: [MovedStepDto] })
  moved!: MovedStepDto[];
}

export class AdvisoryDto {
  @ApiProperty({ example: 'SOURCE_DATE_CHECK' })
  code!: string;

  @ApiProperty({
    example: 'The new source is dated 2026. Check before approving.',
  })
  message!: string;
}

export class BlockerDto {
  @ApiProperty({
    enum: [
      'MISSING_CAREER_FIELD',
      'NO_SKILLS',
      'NO_PATHWAY_STEPS',
      'STEP_HAS_PROGRESS',
    ],
    example: 'STEP_HAS_PROGRESS',
  })
  code!: string;

  @ApiProperty({ example: 'Cannot remove step "HTML" — 7 learners affected' })
  message!: string;

  @ApiProperty({ example: 'steps' })
  section!: string;

  @ApiPropertyOptional({ example: 'a3f2c1d4-…' })
  entityId?: string;

  @ApiPropertyOptional({ example: 'HTML' })
  entityTitle?: string;

  @ApiPropertyOptional({ example: 7 })
  learnersAffected?: number;
}

export class ReviewerDiffResponseDto {
  @ApiProperty({ example: 'a3f2c1d4-…' })
  revisionId!: string;

  @ApiProperty({ example: 'UX Designer: salary range' })
  title!: string;

  @ApiProperty({ example: 'Chidi E.' })
  submittedBy!: string;

  @ApiProperty({ example: '5 hours ago' })
  submittedAt!: string;

  @ApiProperty({ example: 3 })
  baseVersion!: number;

  @ApiProperty({ example: 4 })
  liveVersion!: number;

  @ApiProperty({
    example: false,
    description:
      'True if baseVersion !== liveVersion. Reviewer should request a rebase before approving.',
  })
  stale!: boolean;

  @ApiProperty({
    type: [BlockerDto],
    description: 'Hard stops. Non-empty means publish would fail.',
  })
  blockers!: BlockerDto[];

  @ApiProperty({
    type: [AdvisoryDto],
    description: 'Soft warnings. Show as info banners; do not block approval.',
  })
  advisories!: AdvisoryDto[];

  @ApiProperty({
    description:
      'Changes grouped by section. Each section has changed/added/removed/moved ' +
      'buckets. Sections with no changes are omitted.',
    example: {
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
            before: 'a3f2…',
            after: 'b7e2…',
            beforeLabel: 'Jobberman 2025',
            afterLabel: 'Jobberman 2026',
          },
        ],
        added: [],
        removed: [],
        moved: [],
      },
    },
  })
  sections!: Record<string, SectionChangesDto>;
}
