import { ApiProperty } from '@nestjs/swagger';

export class FieldListItemDto {
  @ApiProperty({ description: 'Unique identifier of the field' })
  id: string;

  @ApiProperty({
    description: 'Display name of the field',
    example: 'Software Engineering',
  })
  name: string;

  @ApiProperty({
    description: 'Field slug, accepted by the interest filter on GET /careers',
    example: 'software-engineering',
  })
  slug: string;
}
