import { jest } from '@jest/globals';
import { ResendProvider } from './resend.provider';

describe('ResendProvider', () => {
  const sendMock = jest.fn<() => Promise<{ data: unknown; error: null }>>();
  const mockClient = { emails: { send: sendMock } };
  const mockConfig = {
    get: (key: string) =>
      ({
        EMAIL_FROM_ADDRESS: 'noreply@mail.path-way.app',
        EMAIL_FROM_NAME: 'Pathway',
      })[key],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('sends through the injected Resend client', async () => {
    const provider = new ResendProvider(
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

  it('builds the from address as "Name <address>"', async () => {
    const provider = new ResendProvider(
      mockClient as never,
      mockConfig as never,
    );

    await provider.send({
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Pathway <noreply@mail.path-way.app>',
      }),
    );
  });

  it('passes to, subject, html, and text through unchanged', async () => {
    const provider = new ResendProvider(
      mockClient as never,
      mockConfig as never,
    );

    await provider.send({
      to: 'user@example.com',
      subject: 'Verify your email',
      html: '<p>Code: 123456</p>',
      text: 'Code: 123456',
    });

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Pathway <noreply@mail.path-way.app>',
      to: 'user@example.com',
      subject: 'Verify your email',
      html: '<p>Code: 123456</p>',
      text: 'Code: 123456',
    });
  });

  it('throws when the Resend API returns an error', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified' },
    } as never);

    const provider = new ResendProvider(
      mockClient as never,
      mockConfig as never,
    );

    await expect(
      provider.send({
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
        text: 'Hi',
      }),
    ).rejects.toThrow(
      /Resend send failed: Resend API error: .*domain not verified/,
    );
  });
});
