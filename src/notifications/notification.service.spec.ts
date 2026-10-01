import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from './interfaces/email-provider.interface';

describe('NotificationService', () => {
  let service: NotificationService;
  const mockProvider: { send: jest.Mock<EmailProvider['send']> } = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: EMAIL_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('renders the named template and delegates to the provider', async () => {
    await service.send('dev@example.com', 'welcome', { name: 'Ada' });

    expect(mockProvider.send).toHaveBeenCalledWith({
      to: 'dev@example.com',
      subject: 'Welcome to Pathway',
      html: '<p>Hi Ada, welcome to Pathway!</p>',
      text: 'Hi Ada, welcome to Pathway!',
    });
  });

  it('renders the password-reset template with the reset link and expiry', async () => {
    const resetUrl = 'http://localhost:5173/reset-password?token=abc123';

    await service.send('dev@example.com', 'password-reset', {
      resetUrl,
      expiresInMinutes: 60,
    });

    const [message] = mockProvider.send.mock.calls[0];

    expect(message.to).toBe('dev@example.com');
    expect(message.subject).toBe('Reset your Pathway password');
    expect(message.html).toContain(`href="${resetUrl}"`);
    expect(message.html).toContain('60 minutes');
    expect(message.text).toContain(resetUrl);
    expect(message.text).toContain('60 minutes');
  });

  it('throws for an unknown template', async () => {
    await expect(
      service.send('dev@example.com', 'does-not-exist' as never, {}),
    ).rejects.toThrow('Unknown notification template');

    expect(mockProvider.send).not.toHaveBeenCalled();
  });
});
