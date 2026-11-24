import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ContentType } from '../../generated/prisma/client';

/**
 * GET /admin/sessions?contextType=...&contextId=...
 *
 * Returns the caller's open (DRAFT) session for the (contextType, contextId)
 * pair, or null. Scoped to the authenticated user — the createdById filter
 * comes from the token, not the query.
 */
export class FindOpenSessionQueryDto {
  @ApiProperty({ enum: ContentType, example: ContentType.CAREER })
  @IsEnum(ContentType)
  contextType!: ContentType;

  @ApiProperty({ example: 'd4e5f6a7-0000-0000-0000-000000000000' })
  @IsString()
  @IsNotEmpty()
  contextId!: string;
}
