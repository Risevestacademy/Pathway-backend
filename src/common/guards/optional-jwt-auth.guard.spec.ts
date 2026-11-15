import { jest } from '@jest/globals';
import { ExecutionContext, Logger } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

type ResponseLike = {
  setHeader: jest.Mock<(name: string, value: string) => void>;
};

const contextFor = (
  headers: Record<string, string | undefined>,
): { context: ExecutionContext; response: ResponseLike } => {
  const response: ResponseLike = { setHeader: jest.fn() };
  const request = { headers };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, response };
};

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warnSpy.mockRestore());

  describe('canActivate', () => {
    it('allows a request with no Authorization header without delegating', () => {
      const { context } = contextFor({});
      expect(guard.canActivate(context)).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('delegates when an Authorization header is present', () => {
      const superActivate = jest
        .spyOn(
          Object.getPrototypeOf(OptionalJwtAuthGuard.prototype) as {
            canActivate: (c: ExecutionContext) => boolean;
          },
          'canActivate',
        )
        .mockReturnValue(true);
      const { context } = contextFor({ authorization: 'Bearer x' });

      expect(guard.canActivate(context)).toBe(true);
      expect(superActivate).toHaveBeenCalledWith(context);

      superActivate.mockRestore();
    });
  });

  describe('handleRequest', () => {
    it('returns the attached user and sets no header', () => {
      const { context, response } = contextFor({ authorization: 'Bearer x' });
      const user = { id: 'user-1' };

      const result = guard.handleRequest(null, user, undefined, context);

      expect(result).toBe(user);
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('treats a missing user with no info as an invalid token', () => {
      const { context, response } = contextFor({ authorization: 'Bearer x' });

      const result = guard.handleRequest(null, false, undefined, context);

      expect(result).toBeUndefined();
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Auth-Status',
        'invalid',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        { reason: 'invalid' },
        'Optional auth rejected token',
      );
    });

    it('sets expired when passport reports TokenExpiredError', () => {
      const { context, response } = contextFor({ authorization: 'Bearer x' });

      guard.handleRequest(null, false, { name: 'TokenExpiredError' }, context);

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Auth-Status',
        'expired',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        { reason: 'expired' },
        'Optional auth rejected token',
      );
    });

    it('never logs the token or a user id', () => {
      const { context } = contextFor({ authorization: 'Bearer secret-token' });

      guard.handleRequest(null, false, undefined, context);

      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain('secret-token');
      expect(logged).not.toContain('Bearer');
    });
  });
});
