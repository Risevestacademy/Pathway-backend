import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'USER' })
  role: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ada Obi' })
  fullName: string | null;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}
