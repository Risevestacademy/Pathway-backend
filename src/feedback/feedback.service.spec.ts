import { jest } from '@jest/globals';
import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma';
import { Prisma } from '../generated/prisma/client';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const mockPrismaService = {
    contentFeedback: {
      create: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.contentFeedback.create.mockResolvedValue({
      id: 'feedback-1',
    });
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    logSpy.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('submitFeedback', () => {
    it('stores general feedback and returns a confirmation without ids', async () => {
      const result = await service.submitFeedback({
        category: 'USABILITY',
        description: 'The filters are hard to find.',
        section: 'GENERAL',
      });

      expect(mockPrismaService.contentFeedback.create).toHaveBeenCalledWith({
        data: {
          category: 'USABILITY',
          description: 'The filters are hard to find.',
          section: 'GENERAL',
          careerId: undefined,
          userEmail: undefined,
          platform: undefined,
        },
        select: { id: true },
      });
      expect(result).toEqual({ message: 'Feedback received' });
    });

    it('stores every optional field', async () => {
      await service.submitFeedback({
        category: 'BROKEN_LINK',
        description: 'Step 3 link is dead.',
        section: 'RESOURCES',
        careerId: 'career-1',
        userEmail: 'ada@example.com',
        platform: 'IOS',
      });

      expect(mockPrismaService.contentFeedback.create).toHaveBeenCalledWith({
        data: {
          category: 'BROKEN_LINK',
          description: 'Step 3 link is dead.',
          section: 'RESOURCES',
          careerId: 'career-1',
          userEmail: 'ada@example.com',
          platform: 'IOS',
        },
        select: { id: true },
      });
    });

    it('logs the category, section and careerId but never the email or description', async () => {
      await service.submitFeedback({
        category: 'INCORRECT_CONTENT',
        description: 'Salary looks wrong.',
        section: 'OUTLOOK',
        careerId: 'career-1',
        userEmail: 'ada@example.com',
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        {
          category: 'INCORRECT_CONTENT',
          section: 'OUTLOOK',
          careerId: 'career-1',
        },
        'Feedback submitted',
      );
      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain('ada@example.com');
      expect(logged).not.toContain('Salary looks wrong.');
    });

    it('throws BadRequestException and warns with the careerId when it matches no career', async () => {
      mockPrismaService.contentFeedback.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint violated',
          { code: 'P2003', clientVersion: 'test' },
        ),
      );

      await expect(
        service.submitFeedback({
          category: 'INCORRECT_CONTENT',
          description: 'Salary looks wrong.',
          section: 'OUTLOOK',
          careerId: 'missing-career',
        }),
      ).rejects.toThrow(new BadRequestException('Career not found'));
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        { careerId: 'missing-career', reason: 'CAREER_NOT_FOUND' },
        'Feedback rejected',
      );
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.contentFeedback.create.mockRejectedValue(failure);

      await expect(
        service.submitFeedback({
          category: 'OTHER',
          description: 'x',
          section: 'GENERAL',
        }),
      ).rejects.toBe(failure);
    });
  });
});
