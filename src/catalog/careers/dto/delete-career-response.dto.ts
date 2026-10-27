import { ApiProperty } from '@nestjs/swagger';

export class DeleteCareerResponseDto {
  @ApiProperty({ example: 'Career deleted' })
  message: string;
}
