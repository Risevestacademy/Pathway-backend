import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { configureApp } from './configure-app';

describe('configureApp', () => {
  const use = jest.fn();
  const setGlobalPrefix = jest.fn();
  const app = {
    get: () => ({ get: () => 'v1' }),
    use,
    setGlobalPrefix,
  } as unknown as INestApplication;

  beforeEach(() => {
    jest.clearAllMocks();
    configureApp(app);
  });

  it('parses cookies so the web refresh token can be read', () => {
    expect(use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('serves every route but /health under the versioned API prefix', () => {
    expect(setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: ['health'],
    });
  });
});
