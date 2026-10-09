import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { TemplateRenderer } from './template-renderer.service';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from './interfaces/email-provider.interface';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockProvider: { send: jest.Mock<EmailProvider['send']> } = {
    send: jest.fn(),
  };
  const mockRenderer: { render: jest.Mock<TemplateRenderer['render']> } = {
    render: jest.fn(),
  };

  const rendered = {
    subject: 'Test subject',
    html: '<p>html body</p>',
    text: 'text body',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockRenderer.render.mockReturnValue(rendered);
    mockProvider.send.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: TemplateRenderer, useValue: mockRenderer },
        { provide: EMAIL_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('renders the named template and delegates the result to the provider', async () => {
    await service.send('dev@example.com', 'welcome', { name: 'Ada' });

    expect(mockRenderer.render).toHaveBeenCalledWith('welcome', {
      name: 'Ada',
    });
    expect(mockProvider.send).toHaveBeenCalledWith({
      to: 'dev@example.com',
      ...rendered,
    });
  });

  it('does not call the provider when rendering fails', async () => {
    mockRenderer.render.mockImplementation(() => {
      throw new Error('Unknown notification template: nope');
    });

    await expect(
      service.send('dev@example.com', 'welcome', {}),
    ).rejects.toThrow('Unknown notification template');

    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it('lets provider failures propagate to the caller', async () => {
    mockProvider.send.mockRejectedValue(new Error('provider down'));

    await expect(
      service.send('dev@example.com', 'welcome', { name: 'Ada' }),
    ).rejects.toThrow('provider down');
  });
});
