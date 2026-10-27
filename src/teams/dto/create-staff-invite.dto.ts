import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Role } from '../../generated/prisma/client';

export const INVITABLE_ROLES = [
  Role.EDITOR,
  Role.REVIEWER,
  Role.PUBLISHER,
  Role.ADMIN,
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export class CreateStaffInviteDto {
  @ApiProperty({
    example: 'ada@example.com',
    description: 'Email address to invite.',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    enum: INVITABLE_ROLES,
    example: Role.EDITOR,
    description: 'Staff role to assign on acceptance.',
  })
  @IsIn(INVITABLE_ROLES, {
    message: `role must be one of: ${INVITABLE_ROLES.join(', ')}`,
  })
  role!: InvitableRole;
}
