import { ApiProperty } from '@nestjs/swagger';

class AuthTokensResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}

export class LoginApiResponseDto {
  @ApiProperty({ type: AuthTokensResponseDto })
  data: AuthTokensResponseDto;
}
