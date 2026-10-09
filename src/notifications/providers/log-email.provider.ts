import { Logger } from '@nestjs/common';
import type {
  EmailMessage,
  EmailProvider,
} from '../interfaces/email-provider.interface';

// Matches http(s) URLs up to the first whitespace, quote, or angle bracket
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

export class LogEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LogEmailProvider.name);

  send(message: EmailMessage): Promise<void> {
    // Prefer the text body: Handlebars HTML-escapes `=` and `&` inside
    // attributes, so URLs found in the HTML would be corrupted.
    const source = message.text ?? message.html;
    const links = [...new Set(source.match(URL_PATTERN) ?? [])];

    this.logger.log(
      { to: message.to, subject: message.subject, links },
      'Email not sent (log driver)',
    );

    return Promise.resolve();
  }
}
