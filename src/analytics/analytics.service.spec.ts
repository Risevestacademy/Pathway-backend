import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// Register the ESM mock BEFORE importing the module under test.
jest.unstable_mockModule('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Dynamic imports so the mock is applied first.
const { PostHog } = await import('posthog-node');
const { AnalyticsService } = await import('./analytics.service');

const MockedPostHog = jest.mocked(PostHog);

describe('AnalyticsService', () => {
  const buildService = async (
    enabled: boolean,
  ): Promise<InstanceType<typeof AnalyticsService>> => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'ANALYTICS_ENABLED') return enabled;
        if (key === 'POSTHOG_API_KEY') return 'phc_test';
        if (key === 'POSTHOG_HOST') return 'https://eu.i.posthog.com';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get(AnalyticsService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops when analytics is disabled', async () => {
    const service = await buildService(false);

    service.onModuleInit();
    service.capture('user_signed_up', 'user-1', { method: 'password' });

    expect(MockedPostHog).not.toHaveBeenCalled();
  });

  it('does not propagate client errors', async () => {
    const service = await buildService(true);
    service.onModuleInit();

    const client = MockedPostHog.mock.results[0]!.value;
    client.capture.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      service.capture('user_signed_up', 'user-1', { method: 'password' }),
    ).not.toThrow();
  });

  it('flushes the client on shutdown', async () => {
    const service = await buildService(true);
    service.onModuleInit();

    const client = MockedPostHog.mock.results[0]!.value;

    await service.onModuleDestroy();

    expect(client.shutdown).toHaveBeenCalledTimes(1);
  });

  it('does not construct a client when disabled', async () => {
    const service = await buildService(false);
    service.onModuleInit();

    expect(MockedPostHog).not.toHaveBeenCalled();
  });

  it('is a no-op when distinctId is falsy', async () => {
    const service = await buildService(true);
    service.onModuleInit();

    const client = MockedPostHog.mock.results[0]!.value;

    service.capture('user_signed_up', '', { method: 'password' });

    expect(client.capture).not.toHaveBeenCalled();
  });
});
