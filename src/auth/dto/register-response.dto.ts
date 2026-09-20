import { ApiProperty } from '@nestjs/swagger';

class RegisterResponseDto {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'USER' })
  role: string;
}

export class RegisterApiResponseDto {
  @ApiProperty({ type: RegisterResponseDto })
  data: RegisterResponseDto;
}
