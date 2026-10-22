import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type {
  EmailProvider,
  EmailMessage,
} from '../interfaces/email-provider.interface';
import type { EnvironmentVariables } from '../../config';

export class ResendProvider implements EmailProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly from: string;

  constructor(
    private readonly client: Resend,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    const name = config.get('EMAIL_FROM_NAME', { infer: true });
    const address = config.get('EMAIL_FROM_ADDRESS', { infer: true });
    this.from = `${name} <${address}>`;
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        this.logger.error(
          {
            name: error.name,
            statusCode: error.statusCode,
            resendMessage: error.message,
            to: message.to,
            from: this.from,
          },
          `Resend API error`,
        );

        throw new Error(
          `Resend API error: ${error.name ?? 'unknown'} ` +
            `(status: ${error.statusCode ?? 'n/a'}): ${error.message}`,
        );
      }
    } catch (err) {
      const cause = (err as { cause?: Error }).cause;
      throw new Error(
        `Resend send failed: ${(err as Error).message}` +
          (cause ? ` (cause: ${cause.message})` : ''),
        { cause: err },
      );
    }
  }
}
