import { jest } from '@jest/globals';
import { MailerSendProvider } from './mailersend.provider';

describe('MailerSendProvider', () => {
  const sendMock = jest.fn();
  const mockClient = { email: { send: sendMock } };
  const mockConfig = {
    get: (key: string) =>
      ({
        EMAIL_FROM_ADDRESS: 'noreply@pathway.dev',
        EMAIL_FROM_NAME: 'Pathway',
      })[key],
  };

  beforeEach(() => jest.clearAllMocks());

  it('sends through the injected MailerSend client', async () => {
    const provider = new MailerSendProvider(
      mockClient as never,
      mockConfig as never,
    );

    await provider.send({
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
