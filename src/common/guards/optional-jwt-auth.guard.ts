import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  constructor() {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info: { name?: string } | undefined,
    context: ExecutionContext,
  ): TUser | undefined {
    if (user) return user;

    // A token was present but did not resolve to a user. Treat as anonymous.
    const reason = info?.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('X-Auth-Status', reason);

    this.logger.warn({ reason }, 'Optional auth rejected token');

    return undefined;
  }
}
