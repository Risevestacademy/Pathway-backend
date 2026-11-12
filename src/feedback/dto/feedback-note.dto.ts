import { ApiProperty } from '@nestjs/swagger';

export class FeedbackNoteDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  feedbackId: string;

  @ApiProperty({ format: 'uuid', description: 'The staff member who wrote it' })
  authorId: string;

  @ApiProperty({ example: 'Checked with the content team, fixing today.' })
  body: string;

  @ApiProperty()
  createdAt: Date;
}
