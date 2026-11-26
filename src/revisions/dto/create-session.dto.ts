import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ContentType } from '../../generated/prisma/client';

/**
 * POST /admin/sessions
 *
 * Two modes:
 *
 *   1. Open against an existing context root.
 *      { contextType: 'CAREER', contextId: '<existing career uuid>' }
 *
 *   2. Create a new context root (CAREER only in v1).
 *      { contextType: 'CAREER', contextId: null, initialSnapshot: { ... } }
 *
 * In mode 2, `initialSnapshot` is required and must be a complete career
 * snapshot (title, slug, description, fieldId all present). The service seeds
 * the DRAFT Career row from it. The snapshot is NOT saved as a revision here;
 * the first saveDraft does that. `initialSnapshot` exists only because Career's
 * required columns need values at creation time.
 */
export class CreateSessionDto {
  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  @IsEnum(ContentType)
  contextType!: ContentType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'null to create a new context root; a UUID to open against an existing one.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  contextId!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Required when contextId is null (mode 2). A complete snapshot of the ' +
      'context root. Used to seed the DRAFT row. Not saved as a revision.',
  })
  @IsOptional()
  @IsObject()
  initialSnapshot?: Record<string, unknown>;
}
