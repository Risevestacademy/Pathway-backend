import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ContentType } from '../../generated/prisma/client';

/**
 * POST /admin/sessions
 *
 * `contextId` is:
 *   - `null`   → the service generates a UUID and (for CAREER) creates a
 *                DRAFT Career row at that id. Use this to start a new career.
 *   - a UUID   → the context root must already exist. Use this to open a
 *                session against an existing career.
 *
 * The service enforces the existence check and the DRAFT-Career creation;
 * this DTO only guarantees the shape.
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
}
