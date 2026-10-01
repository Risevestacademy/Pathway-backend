export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}

export interface NotificationTemplate {
  render(data: Record<string, unknown>): RenderedEmail;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  welcome: {
    render: (data) => {
      const name = data.name as string;
      return {
        subject: 'Welcome to Pathway',
        html: `<p>Hi ${name}, welcome to Pathway!</p>`,
        text: `Hi ${name}, welcome to Pathway!`,
      };
    },
  },
  'password-reset': {
    render: (data) => {
      const resetUrl = data.resetUrl as string;
      const expiresInMinutes = data.expiresInMinutes as number;
      return {
        subject: 'Reset your Pathway password',
        html: `<p>Use this link to reset your Pathway password: <a href="${resetUrl}">${resetUrl}</a></p><p>The link expires in ${expiresInMinutes} minutes. If you did not request a reset, ignore this email.</p>`,
        text: `Use this link to reset your Pathway password: ${resetUrl}\n\nThe link expires in ${expiresInMinutes} minutes. If you did not request a reset, ignore this email.`,
      };
    },
  },
};

export type NotificationTemplateName = keyof typeof NOTIFICATION_TEMPLATES;
