import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'USER' })
  role: string;
}

export class AuthTokensResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  accessToken: string;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1Ni...',
    description:
      'Returned to mobile clients only. Web clients receive it as an HttpOnly cookie.',
  })
  refreshToken?: string;
}

export class AuthResponseDto extends AuthTokensResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
