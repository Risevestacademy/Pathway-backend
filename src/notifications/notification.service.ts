import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from './interfaces/email-provider.interface';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationTemplateName,
} from './templates/templates';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  async send<T extends Record<string, unknown>>(
    to: string,
    template: NotificationTemplateName,
    data: T,
  ): Promise<void> {
    const definition = NOTIFICATION_TEMPLATES[template];

    if (!definition) {
      throw new Error(`Unknown notification template: ${String(template)}`);
    }

    const { subject, html, text } = definition.render(data);

    await this.provider.send({ to, subject, html, text });
    this.logger.log(`Sent "${template}" notification to ${to}`);
  }
}
