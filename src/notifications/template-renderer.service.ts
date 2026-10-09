import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationTemplateName,
} from './templates/templates';

// Token for the folder that holds the .hbs/.txt files.
// The module supplies the real path, and tests supply their own.
export const TEMPLATES_DIR = Symbol('TEMPLATES_DIR');

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface CompiledTemplate {
  html: Handlebars.TemplateDelegate;
  text: Handlebars.TemplateDelegate;
}

@Injectable()
export class TemplateRenderer implements OnModuleInit {
  private layout!: Handlebars.TemplateDelegate;
  private readonly templates = new Map<
    NotificationTemplateName,
    CompiledTemplate
  >();

  constructor(@Inject(TEMPLATES_DIR) private readonly templatesDir: string) {}

  // Runs once during app bootstrap. If any file is missing or has a syntax
  // error, the app fails to start instead of failing on a user's request.
  onModuleInit(): void {
    this.layout = this.compile('layout.hbs', { escape: true });

    for (const [name, definition] of Object.entries(NOTIFICATION_TEMPLATES)) {
      this.templates.set(name as NotificationTemplateName, {
        html: this.compile(`${definition.file}.hbs`, { escape: true }),
        text: this.compile(`${definition.file}.txt`, { escape: false }),
      });
    }
  }

  render(
    name: NotificationTemplateName,
    data: Record<string, unknown>,
  ): RenderedEmail {
    const template = this.templates.get(name);

    if (!template) {
      throw new Error(`Unknown notification template: ${String(name)}`);
    }

    const { subject } = NOTIFICATION_TEMPLATES[name];
    const body = template.html(data);

    return {
      subject,
      html: this.layout({ subject, body }),
      text: template.text(data),
    };
  }

  private compile(
    file: string,
    options: { escape: boolean },
  ): Handlebars.TemplateDelegate {
    const source = readFileSync(join(this.templatesDir, file), 'utf8');

    return Handlebars.compile(source, {
      strict: true,
      noEscape: !options.escape,
    });
  }
}
