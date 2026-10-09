export interface NotificationTemplateDefinition {
  subject: string;
  /** Base file name in this folder: `<file>.hbs` and `<file>.txt` */
  file: string;
}

export const NOTIFICATION_TEMPLATES = {
  welcome: {
    subject: 'Welcome to Pathway',
    file: 'welcome',
  },
  'password-reset': {
    subject: 'Reset your Pathway password',
    file: 'password-reset',
  },
  'email-verification': {
    subject: 'Verify your Pathway email',
    file: 'email-verification',
  },
} as const satisfies Record<string, NotificationTemplateDefinition>;

export type NotificationTemplateName = keyof typeof NOTIFICATION_TEMPLATES;
