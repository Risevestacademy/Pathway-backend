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
};

export type NotificationTemplateName = keyof typeof NOTIFICATION_TEMPLATES;
