import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateFeedbackNoteDto {
  @ApiProperty({
    example: 'Checked with the content team, fixing today.',
    description:
      'An internal note, never shown to users. 1 to 2000 characters.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  body: string;
}
