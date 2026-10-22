import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type {
  EmailProvider,
  EmailMessage,
} from '../interfaces/email-provider.interface';
import type { EnvironmentVariables } from '../../config';

export class ResendProvider implements EmailProvider {
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
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}
