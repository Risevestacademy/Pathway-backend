import { ApiProperty } from '@nestjs/swagger';

export class RevokeInviteResponseDto {
  @ApiProperty({ example: 'Invite revoked' })
  message: string;
}
