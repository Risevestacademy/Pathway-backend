import { Role } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}
