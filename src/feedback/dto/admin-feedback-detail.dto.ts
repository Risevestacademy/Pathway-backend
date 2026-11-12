import { ApiProperty } from '@nestjs/swagger';
import { AdminFeedbackListItemDto } from './admin-feedback-list-item.dto';
import { FeedbackNoteDto } from './feedback-note.dto';

// Admin only. The public response is PublicFeedbackDto, which has no notes.
export class AdminFeedbackDetailDto extends AdminFeedbackListItemDto {
  @ApiProperty({
    type: [FeedbackNoteDto],
    description: 'Internal notes, oldest first',
  })
  notes: FeedbackNoteDto[];
}
