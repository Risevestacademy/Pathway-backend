import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1Ni...',
    description: 'Required for mobile clients; web clients use the cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
