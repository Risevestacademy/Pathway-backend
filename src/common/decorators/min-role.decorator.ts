import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const MIN_ROLE_KEY = 'minRole';

export const ROLE_RANK: Readonly<Record<Role, number>> = {
  [Role.ADMIN]: 4,
  [Role.PUBLISHER]: 3,
  [Role.REVIEWER]: 2,
  [Role.EDITOR]: 1,
  [Role.USER]: 0,
};

export const MinRole = (role: Role) =>
  SetMetadata(MIN_ROLE_KEY, ROLE_RANK[role]);
