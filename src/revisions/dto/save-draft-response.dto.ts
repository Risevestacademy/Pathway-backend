import { ApiProperty } from '@nestjs/swagger';
import { RevisionSessionResponseDto } from './revision-session-response.dto';
import { ValidationWarningDto } from './save-draft.dto';

/**
 * The session (post-save) plus per-change validation warnings.
 *
 * Warnings do NOT fail the save. Submit hard-fails on them
 * (400 VALIDATION_FAILED). Same strategy.validate() in both paths, different
 * enforcement.
 */
export class SaveDraftResponseDto extends RevisionSessionResponseDto {
  @ApiProperty({
    type: [ValidationWarningDto],
    description:
      'Changes with warnings. Empty array when every change validates clean. ' +
      'Changes that validate clean are omitted.',
  })
  validation!: ValidationWarningDto[];
}
