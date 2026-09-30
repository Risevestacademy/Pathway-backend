import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerSend } from 'mailersend';
import { NotificationService } from './notification.service';
import {
  MailerSendProvider,
  MAILERSEND_CLIENT,
} from './providers/mailersend.provider';
import { EMAIL_PROVIDER } from './interfaces/email-provider.interface';
import type { EnvironmentVariables } from '../config';

@Module({
  providers: [
    NotificationService,
    {
      provide: MAILERSEND_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new MailerSend({
          apiKey: config.get('MAILERSEND_API_KEY', { infer: true }),
        }),
    },
    { provide: EMAIL_PROVIDER, useClass: MailerSendProvider },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
