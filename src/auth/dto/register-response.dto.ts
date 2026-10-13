import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({ example: 'Verification code sent' })
  message: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;
}
