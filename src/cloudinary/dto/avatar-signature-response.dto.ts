import { ApiProperty } from '@nestjs/swagger';

export class AvatarSignatureResponseDto {
  @ApiProperty({ example: 'my-cloud-name' })
  cloudName: string;

  @ApiProperty({ example: '123456789012345' })
  apiKey: string;

  @ApiProperty({ example: 1700000000 })
  timestamp: number;

  @ApiProperty({ example: 'abcdef1234567890abcdef1234567890abcdef12' })
  signature: string;

  @ApiProperty({ example: 'avatars/user-uuid-here' })
  folder: string;

  @ApiProperty({ example: 'avatar_preset' })
  uploadPreset: string;
}
