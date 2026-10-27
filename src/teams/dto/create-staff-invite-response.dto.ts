import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export class CreateStaffInviteResponseDto {
  @ApiProperty({ example: 'b2c3d4e5-...' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.EDITOR })
  role!: Role;

  @ApiProperty({ example: '2026-10-26T09:00:00.000Z' })
  expiresAt!: Date;

  @ApiProperty({
    example: true,
    description:
      'Whether the invitation email was dispatched. When false, the invite ' +
      'exists and can be re-sent by re-inviting the same email.',
  })
  emailSent!: boolean;

  @ApiProperty({
    required: false,
    example:
      'Invite created, but the email could not be sent. Re-invite to retry.',
  })
  message?: string;
}
