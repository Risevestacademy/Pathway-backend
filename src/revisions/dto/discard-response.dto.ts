import { ApiProperty } from '@nestjs/swagger';

/**
 * DELETE /admin/sessions/:id
 *
 * DRAFT only. Cascades revisions. Deletes the DRAFT Career row too when
 * session.createdCareer === true (the session created it).
 */
export class DiscardResponseDto {
  @ApiProperty({ example: 'Draft discarded' })
  message!: string;
}
