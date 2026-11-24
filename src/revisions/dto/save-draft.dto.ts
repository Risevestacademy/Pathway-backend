import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ContentType } from '../../generated/prisma/client';

/**
 * One changed model in a batch save.
 *
 * `snapshot` is opaque to the envelope — each strategy owns its shape. The
 * DTO enforces "is an object"; the strategy's validate() enforces content.
 */
export class RevisionChangeInputDto {
  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  @IsEnum(ContentType)
  contentType!: ContentType;

  @ApiProperty({
    example: 'b7e2d1a9-0000-0000-0000-000000000000',
    description:
      "The content root's id. For a newly-created resource in this session, " +
      'this may be a temp id (`new-1`); the publisher rewrites it at publish.',
  })
  @IsString()
  @IsNotEmpty()
  contentId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The full proposed snapshot. Shape is strategy-defined.',
  })
  @IsObject()
  snapshot!: Record<string, unknown>;
}

/**
 * POST /admin/sessions/:sessionId/draft
 *
 * Replace semantics: the payload is the complete set of drafts for the
 * session. Revisions not in the payload are deleted in the same transaction
 */
export class SaveDraftDto {
  @ApiProperty({ type: [RevisionChangeInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RevisionChangeInputDto)
  changes!: RevisionChangeInputDto[];
}

/**
 * One non-fatal validation result. Empty `problems` entries are omitted from
 * the response, so the array is "changes that have warnings".
 */
export class ValidationWarningDto {
  @ApiProperty({ enum: ContentType, example: ContentType.PATHWAY_STEP })
  contentType!: ContentType;

  @ApiProperty({ example: 'new-1' })
  contentId!: string;

  @ApiProperty({
    type: [String],
    example: ['learningObjective is required', 'expectedActivity is required'],
  })
  problems!: string[];
}
