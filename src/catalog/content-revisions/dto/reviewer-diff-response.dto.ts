import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FieldChangeDto {
  @ApiProperty({ example: 'sourceId' })
  field!: string;

  @ApiProperty({ example: 'Source' })
  label!: string;

  @ApiProperty({
    description: 'Raw value.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
      { type: 'object', additionalProperties: true },
    ],
    example: 'a3f2c1d4-…',
  })
  before!: unknown;

  @ApiProperty({
    description: 'Raw value.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
      { type: 'object', additionalProperties: true },
    ],
    example: 'b7e2d1a9-…',
  })
  after!: unknown;

  @ApiPropertyOptional({ example: 'Jobberman salary guide 2025' })
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
  @ApiProperty({ example: 'career' })
  section!: string; // 👈 Added this

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
  @ApiProperty({ example: 'STEP_HAS_PROGRESS' })
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

  @ApiProperty({ example: false })
  stale!: boolean;

  @ApiProperty({ type: [BlockerDto] })
  blockers!: BlockerDto[];

  @ApiProperty({ type: [AdvisoryDto] })
  advisories!: AdvisoryDto[];

  @ApiProperty({
    type: [SectionChangesDto],
    description: 'Changes grouped by section. Empty sections are omitted.',
  })
  sections!: SectionChangesDto[];
}
