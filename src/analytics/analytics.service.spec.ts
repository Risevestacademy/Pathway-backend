import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';

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

const TTL_SECONDS = 60;

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('AnalyticsService', () => {
  const prisma = {
    user: {
      findUnique:
        jest.fn<
          (args: unknown) => Promise<{ analyticsEnabled: boolean } | null>
        >(),
    },
  };

  const buildService = async (
    enabled: boolean,
  ): Promise<InstanceType<typeof AnalyticsService>> => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'ANALYTICS_ENABLED') return enabled;
        if (key === 'POSTHOG_API_KEY') return 'phc_test';
        if (key === 'POSTHOG_HOST') return 'https://eu.i.posthog.com';
        if (key === 'ANALYTICS_OPT_IN_CACHE_TTL_SECONDS') return TTL_SECONDS;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    return module.get(AnalyticsService);
  };

  const startEnabled = async () => {
    const service = await buildService(true);
    service.onModuleInit();
    const client = MockedPostHog.mock.results[0]!.value as {
      capture: jest.Mock;
    };
    return { service, client };
  };

  const optedIn = (analyticsEnabled: boolean) =>
    prisma.user.findUnique.mockResolvedValue({ analyticsEnabled });

  beforeEach(() => {
    jest.clearAllMocks();
    optedIn(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops when analytics is disabled', async () => {
    const service = await buildService(false);

    service.onModuleInit();
    service.capture('user_signed_up', 'user-1', { method: 'email' });
    await flush();

    expect(MockedPostHog).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not propagate client errors', async () => {
    const { service, client } = await startEnabled();
    client.capture.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      service.capture('user_signed_up', 'user-1', { method: 'email' }),
    ).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
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
    const { service, client } = await startEnabled();

    service.capture('user_signed_up', '', { method: 'email' });
    await flush();

    expect(client.capture).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  describe('opt-out gate', () => {
    it('sends a user-linked event for an opted-in user', async () => {
      const { service, client } = await startEnabled();

      service.capture('pathway_saved', 'user-1', { careerId: 'career-1' });
      await flush();

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { analyticsEnabled: true },
      });
      expect(client.capture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'pathway_saved',
        properties: { careerId: 'career-1' },
      });
    });

    it('skips a user-linked event for an opted-out user', async () => {
      optedIn(false);
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();

      expect(client.capture).not.toHaveBeenCalled();
    });

    it('sends events with no user data regardless, without a lookup', async () => {
      optedIn(false);
      const { service, client } = await startEnabled();

      service.captureAnonymous('email_verified', 'system');
      await flush();

      expect(client.capture).toHaveBeenCalledWith({
        distinctId: 'system',
        event: 'email_verified',
        properties: {},
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('reads the flag once within the TTL', async () => {
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();
      service.capture('email_verified', 'user-1');
      await flush();

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(client.capture).toHaveBeenCalledTimes(2);
    });

    it('reads the flag again once the TTL expires', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const { service } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();
      now.mockReturnValue(1_000_000 + TTL_SECONDS * 1000 + 1);
      service.capture('email_verified', 'user-1');
      await flush();

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('reads a fresh flag after invalidateUser', async () => {
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();

      optedIn(false);
      service.invalidateUser('user-1');
      service.capture('email_verified', 'user-1');
      await flush();

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      expect(client.capture).toHaveBeenCalledTimes(1);
    });

    it('resumes events after opting back in, with no backfill', async () => {
      optedIn(false);
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();

      optedIn(true);
      service.invalidateUser('user-1');
      service.capture('pathway_saved', 'user-1', { careerId: 'career-1' });
      await flush();

      expect(client.capture).toHaveBeenCalledTimes(1);
      expect(client.capture).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'pathway_saved' }),
      );
    });

    it('skips the event when the lookup fails', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();

      expect(client.capture).not.toHaveBeenCalled();
    });

    it('does not cache a failed lookup', async () => {
      prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();
      service.capture('email_verified', 'user-1');
      await flush();

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      expect(client.capture).toHaveBeenCalledTimes(1);
    });

    it('skips the event for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      await flush();

      expect(client.capture).not.toHaveBeenCalled();
    });

    it('keeps each user’s flag separate', async () => {
      prisma.user.findUnique.mockImplementation(async (args) => ({
        analyticsEnabled:
          (args as { where: { id: string } }).where.id === 'user-1',
      }));
      const { service, client } = await startEnabled();

      service.capture('email_verified', 'user-1');
      service.capture('email_verified', 'user-2');
      await flush();

      expect(client.capture).toHaveBeenCalledTimes(1);
      expect(client.capture).toHaveBeenCalledWith(
        expect.objectContaining({ distinctId: 'user-1' }),
      );
    });
  });
});
