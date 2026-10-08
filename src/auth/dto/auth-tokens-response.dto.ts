import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users';

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
