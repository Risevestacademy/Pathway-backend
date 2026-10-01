import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import type {
  EmailProvider,
  EmailMessage,
} from '../interfaces/email-provider.interface';
import type { EnvironmentVariables } from '../../config';

export const MAILERSEND_CLIENT = Symbol('MAILERSEND_CLIENT');

@Injectable()
export class MailerSendProvider implements EmailProvider {
  private readonly sender: Sender;

  constructor(
    @Inject(MAILERSEND_CLIENT) private readonly client: MailerSend,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.sender = new Sender(
      config.get('EMAIL_FROM_ADDRESS', { infer: true }),
      config.get('EMAIL_FROM_NAME', { infer: true }),
    );
  }

  async send(message: EmailMessage): Promise<void> {
    const emailParams = new EmailParams()
      .setFrom(this.sender)
      .setTo([new Recipient(message.to)])
      .setSubject(message.subject)
      .setHtml(message.html);

    if (message.text) {
      emailParams.setText(message.text);
    }

    await this.client.email.send(emailParams);
  }
}
