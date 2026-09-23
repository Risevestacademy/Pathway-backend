import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1Ni...' })
  refreshToken: string;
}
