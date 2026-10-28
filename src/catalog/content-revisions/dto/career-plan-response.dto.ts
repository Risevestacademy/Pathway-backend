import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlanOperationDto {
  @ApiProperty({
    enum: ['create', 'update', 'move', 'delete', 'link', 'unlink'],
    description: 'The kind of change publishing would apply.',
    example: 'update',
  })
  kind!: string;

  @ApiProperty({
    enum: [
      'career',
      'pathway',
      'steps',
      'stepSkills',
      'stepResources',
      'skills',
      'outlook',
      'resources',
    ],
    description: 'Which part of the career the operation belongs to.',
    example: 'career',
  })
  section!: string;

  @ApiPropertyOptional({
    description:
      'ID of the entity being changed. For creates on new entities, this ' +
      'is a temporary ID like "new-1".',
    example: 'a3f2c1d4-…',
    type: String,
  })
  entityId?: string;

  @ApiPropertyOptional({
    description:
      'For link/unlink operations on step skills or step resources: the ' +
      'ID of the parent step.',
    type: String,
  })
  parentId?: string;

  @ApiPropertyOptional({
    description: 'For update operations: the name of the field being changed.',
    example: 'title',
    type: String,
  })
  field?: string;

  @ApiPropertyOptional({
    description:
      'Value before publishing. The shape depends on `kind`, `section` and ' +
      '`field`: a string for career text fields, an order number for moves, ' +
      'an object for outlook updates, and so on. Present only for update, ' +
      'move, delete and unlink.',
    type: 'object',
    additionalProperties: true,
  })
  before?: unknown;

  @ApiPropertyOptional({
    description:
      'Value after publishing. Same shape rules as `before`. Present only ' +
      'for create, update, move and link.',
    type: 'object',
    additionalProperties: true,
  })
  after?: unknown;
}

export class PlanBlockerDto {
  @ApiProperty({
    enum: [
      'MISSING_CAREER_FIELD',
      'NO_SKILLS',
      'NO_PATHWAY_STEPS',
      'STEP_HAS_PROGRESS',
    ],
    description: 'Stable error code for the blocker.',
    example: 'STEP_HAS_PROGRESS',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable explanation for the reviewer.',
    example: 'Cannot remove step "HTML" — 7 learners affected',
  })
  message!: string;

  @ApiProperty({
    description: 'Which section of the career the blocker belongs to.',
    example: 'steps',
  })
  section!: string;

  @ApiPropertyOptional({
    example: 'a3f2c1d4-…',
    description: 'ID of the entity causing the blocker.',
  })
  entityId?: string;

  @ApiPropertyOptional({
    example: 'HTML',
    description:
      'Human-readable title of the entity, when applicable (currently only steps).',
  })
  entityTitle?: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      'For STEP_HAS_PROGRESS only: how many learners have completed this step.',
  })
  learnersAffected?: number;
}

export class PlanCountsDto {
  @ApiProperty({
    example: 3,
    description: 'Number of create + link operations.',
  })
  added!: number;

  @ApiProperty({ example: 5, description: 'Number of update operations.' })
  changed!: number;

  @ApiProperty({ example: 1, description: 'Number of move operations.' })
  moved!: number;

  @ApiProperty({
    example: 2,
    description: 'Number of delete + unlink operations.',
  })
  removed!: number;

  @ApiProperty({ example: 0, description: 'Number of blockers.' })
  blockers!: number;
}

export class CareerPlanResponseDto {
  @ApiProperty({
    example: 3,
    description:
      'The version of the live career the revision was created against.',
  })
  baseVersion!: number;

  @ApiProperty({
    example: 4,
    description: 'The current version of the live career.',
  })
  liveVersion!: number;

  @ApiProperty({
    example: false,
    description:
      'True if baseVersion !== liveVersion. Means the live career has moved ' +
      'since this revision was created, so publishing would silently ' +
      "overwrite someone else's changes. The reviewer should request a " +
      'rebase before approving.',
  })
  stale!: boolean;

  @ApiProperty({
    type: [PlanOperationDto],
    description:
      'Every change publishing would apply, in the order the publish engine ' +
      'will read them. Empty means the snapshot is identical to the live career.',
  })
  operations!: PlanOperationDto[];

  @ApiProperty({
    type: [PlanBlockerDto],
    description:
      'Reasons publishing cannot proceed. Non-empty means the revision is ' +
      'not safe to publish; a reviewer should reject or request changes.',
  })
  blockers!: PlanBlockerDto[];

  @ApiProperty({
    type: PlanCountsDto,
    description: 'Pre-aggregated summary for the reviewer UI badge.',
  })
  counts!: PlanCountsDto;
}
