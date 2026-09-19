import { Role } from '../../generated/prisma/enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
