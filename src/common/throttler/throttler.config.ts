import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { EnvironmentVariables } from '../../config';

export const AUTH_THROTTLER = 'auth';
const AUTH_THROTTLE_KEY = 'authThrottle';
const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/** Marks a route as subject to the stricter `auth` rate limit. */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

/** Exempts a route or controller from all rate limiting (e.g. /health). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

// Checks the route handler first, then the controller class
const hasFlag = (key: string, context: ExecutionContext): boolean =>
  [context.getHandler(), context.getClass()].some(
    (target) => Reflect.getMetadata(key, target) === true,
  );

export const throttlerOptionsFactory = (
  config: ConfigService<EnvironmentVariables, true>,
): ThrottlerOptions[] => {
  const ttl = config.get('THROTTLE_TTL_MS', { infer: true });

  return [
    {
      name: 'default',
      ttl,
      limit: config.get('THROTTLE_LIMIT', { infer: true }),
      skipIf: (context) => hasFlag(SKIP_RATE_LIMIT_KEY, context),
    },
    {
      name: AUTH_THROTTLER,
      ttl,
      limit: config.get('THROTTLE_AUTH_LIMIT', { infer: true }),
      // Only routes tagged with @AuthThrottle() count against this limit
      skipIf: (context) =>
        hasFlag(SKIP_RATE_LIMIT_KEY, context) ||
        !hasFlag(AUTH_THROTTLE_KEY, context),
    },
  ];
};
