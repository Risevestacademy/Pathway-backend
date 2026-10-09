import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerSend } from 'mailersend';
import { NotificationService } from './notification.service';
import { TemplateRenderer } from './template-renderer.service';
import { MailerSendProvider } from './providers/mailersend.provider';
import { LogEmailProvider } from './providers/log-email.provider';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from './interfaces/email-provider.interface';
import { MailDriver, type EnvironmentVariables } from '../config';

@Module({
  providers: [
    NotificationService,
    TemplateRenderer,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ): EmailProvider => {
        if (config.get('MAIL_DRIVER', { infer: true }) === MailDriver.Log) {
          return new LogEmailProvider();
        }

        return new MailerSendProvider(
          new MailerSend({
            apiKey: config.get('MAILERSEND_API_KEY', { infer: true }),
          }),
          config,
        );
      },
    },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
