import type { ExecutionContext } from '@nestjs/common';
import {
  AuthThrottle,
  SkipRateLimit,
  throttlerOptionsFactory,
} from './throttler.config';

class Sample {
  @AuthThrottle()
  strict() {}

  loose() {}
}

@SkipRateLimit()
class Exempt {
  check() {}
}

const contextFor = (handler: () => void, cls: new () => object = Sample) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;

describe('throttlerOptionsFactory', () => {
  const values = {
    THROTTLE_TTL_MS: 60000,
    THROTTLE_LIMIT: 100,
    THROTTLE_AUTH_LIMIT: 10,
  };
  const config = { get: (key: keyof typeof values) => values[key] };

  const [defaultThrottler, authThrottler] = throttlerOptionsFactory(
    config as never,
  );

  it('builds the default throttler from config', () => {
    expect(defaultThrottler).toMatchObject({
      name: 'default',
      ttl: 60000,
      limit: 100,
    });
  });

  it('builds a stricter auth throttler from config', () => {
    expect(authThrottler).toMatchObject({
      name: 'auth',
      ttl: 60000,
      limit: 10,
    });
    expect(authThrottler.limit).toBeLessThan(defaultThrottler.limit as number);
  });

  it('applies the auth limit only to routes tagged with @AuthThrottle()', () => {
    const skip = authThrottler.skipIf!;

    expect(skip(contextFor(Sample.prototype.strict))).toBe(false);
    expect(skip(contextFor(Sample.prototype.loose))).toBe(true);
  });

  it('applies the default limit to routes that are not exempt', () => {
    expect(defaultThrottler.skipIf!(contextFor(Sample.prototype.loose))).toBe(
      false,
    );
  });

  it('exempts controllers marked with @SkipRateLimit() from every limit', () => {
    const context = contextFor(Exempt.prototype.check, Exempt);

    expect(defaultThrottler.skipIf!(context)).toBe(true);
    expect(authThrottler.skipIf!(context)).toBe(true);
  });
});
