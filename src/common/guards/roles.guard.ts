import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import { MIN_ROLE_KEY, ROLE_RANK } from '../decorators/min-role.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

type GuardedRequest = {
  user?: AuthenticatedUser;
  method?: string;
  route?: { path?: string };
};

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    const minRank = this.reflector.getAllAndOverride<number | undefined>(
      MIN_ROLE_KEY,
      targets,
    );
    if (!roles?.length && minRank === undefined) return true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const role = request.user?.role;
    const rolesPass = !roles?.length || (!!role && roles.includes(role));
    const minRankPass = minRank === undefined || rankOf(role) >= minRank;
    if (rolesPass && minRankPass) return true;

    this.logger.warn(
      {
        route: `${request.method} ${request.route?.path}`,
        requiredRole: minRank === undefined ? null : roleOfRank(minRank),
        allowedRoles: roles?.length ? roles : null,
        userId: request.user?.id ?? null,
        reason: 'INSUFFICIENT_ROLE',
      },
      'Role check denied',
    );
    return false;
  }
}

const rankOf = (role?: string): number =>
  role !== undefined && Object.hasOwn(ROLE_RANK, role)
    ? ROLE_RANK[role as Role]
    : -1;

const roleOfRank = (rank: number): Role | null =>
  (Object.keys(ROLE_RANK) as Role[]).find((role) => ROLE_RANK[role] === rank) ??
  null;
