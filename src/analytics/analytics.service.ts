import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

import { EnvironmentVariables } from '../config';
import { PrismaService } from '../prisma';
import {
  AnalyticsEventName,
  AnalyticsEventProps,
  EventsWithoutProps,
} from './analytics-events';

const OPT_IN_CACHE_MAX_ENTRIES = 10_000;

interface CachedOptIn {
  enabled: boolean;
  expiresAt: number;
}

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly enabled: boolean;
  private readonly optInTtlMs: number;
  private readonly optInCache = new Map<string, CachedOptIn>();
  private client: PostHog | null = null;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = this.configService.get('ANALYTICS_ENABLED', { infer: true });
    this.optInTtlMs =
      this.configService.get('ANALYTICS_OPT_IN_CACHE_TTL_SECONDS', {
        infer: true,
      }) * 1000;
  }

  onModuleInit(): void {
    if (!this.enabled) return;

    this.client = new PostHog(
      this.configService.get('POSTHOG_API_KEY', { infer: true }),
      {
        host: this.configService.get('POSTHOG_HOST', { infer: true }),
        // fire-and-forget semantics; PostHog buffers internally
        flushAt: 20,
        flushInterval: 10000,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.shutdown();
    } catch (error) {
      this.logger.warn(
        `Analytics shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Overloads give callers a compile error if they pass props to a no-prop event,
  // or forget props on a props-required event.
  // User-linked; skipped for opted-out users
  capture<K extends EventsWithoutProps>(event: K, distinctId: string): void;
  capture<K extends Exclude<AnalyticsEventName, EventsWithoutProps>>(
    event: K,
    distinctId: string,
    properties: AnalyticsEventProps<K>,
  ): void;
  capture<K extends AnalyticsEventName>(
    event: K,
    distinctId: string,
    properties?: AnalyticsEventProps<K>,
  ): void {
    if (!this.enabled || !this.client || !distinctId) return;

    void this.isOptedIn(distinctId).then((optedIn) => {
      if (optedIn) this.send(event, distinctId, properties);
    });
  }

  // Not user-linked; never gated
  captureAnonymous<K extends EventsWithoutProps>(
    event: K,
    distinctId: string,
  ): void;
  captureAnonymous<K extends Exclude<AnalyticsEventName, EventsWithoutProps>>(
    event: K,
    distinctId: string,
    properties: AnalyticsEventProps<K>,
  ): void;
  captureAnonymous<K extends AnalyticsEventName>(
    event: K,
    distinctId: string,
    properties?: AnalyticsEventProps<K>,
  ): void {
    if (!this.enabled || !this.client || !distinctId) return;

    this.send(event, distinctId, properties);
  }

  // Next event re-reads the flag
  invalidateUser(userId: string): void {
    this.optInCache.delete(userId);
  }

  private async isOptedIn(userId: string): Promise<boolean> {
    const cached = this.optInCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.enabled;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { analyticsEnabled: true },
      });
      if (!user) return false;

      if (this.optInCache.size >= OPT_IN_CACHE_MAX_ENTRIES)
        this.optInCache.clear();

      this.optInCache.set(userId, {
        enabled: user.analyticsEnabled,
        expiresAt: Date.now() + this.optInTtlMs,
      });
      return user.analyticsEnabled;
    } catch {
      return false;
    }
  }

  private send<K extends AnalyticsEventName>(
    event: K,
    distinctId: string,
    properties?: AnalyticsEventProps<K>,
  ): void {
    try {
      this.client?.capture({
        distinctId,
        event,
        properties: properties ?? {},
      });
    } catch (error) {
      this.logger.warn(
        `Analytics capture failed for ${event}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
