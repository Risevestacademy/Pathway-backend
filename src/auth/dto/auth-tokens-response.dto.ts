import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
