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
  'email-verification-otp': {
    subject: 'Your Pathway verification code',
    file: 'email-verification-otp',
  },
  'password-reset-otp': {
    file: 'password-reset-otp',
    subject: 'Your Pathway password reset code',
  },
} as const satisfies Record<string, NotificationTemplateDefinition>;

export type NotificationTemplateName = keyof typeof NOTIFICATION_TEMPLATES;
