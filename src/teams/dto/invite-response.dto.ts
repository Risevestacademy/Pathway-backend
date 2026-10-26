import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { InviteStatus } from '../teams.constants';

export class InviteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'new.editor@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: 'EDITOR' })
  role: Role;

  @ApiProperty({ enum: InviteStatus, example: 'PENDING' })
  status: InviteStatus;

  @ApiProperty({ format: 'uuid' })
  invitedById: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ada Lovelace' })
  invitedByName: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  acceptedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  revokedAt: Date | null;
}
