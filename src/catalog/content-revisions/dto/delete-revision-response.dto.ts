import { ApiProperty } from '@nestjs/swagger';

export class DeleteRevisionResponseDto {
  @ApiProperty({ example: 'Draft revision deleted' })
  message: string;
}
