import { ApiProperty } from '@nestjs/swagger';

export class CreateFeedbackResponseDto {
  @ApiProperty({ example: 'Feedback received' })
  message: string;
}
