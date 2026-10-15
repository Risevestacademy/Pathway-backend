import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

import { EnvironmentVariables } from '../config';
import {
  AnalyticsEventName,
  AnalyticsEventProps,
  EventsWithoutProps,
} from './analytics-events';

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly enabled: boolean;
  private client: PostHog | null = null;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.enabled = this.configService.get('ANALYTICS_ENABLED', { infer: true });
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

    try {
      this.client.capture({
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
