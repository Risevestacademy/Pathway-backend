import { jest } from '@jest/globals';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma';
import { Prisma } from '../generated/prisma/client';
import type { FeedbackResponseDto } from './dto/feedback-response.dto';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const mockPrismaService = {
    contentFeedback: {
      create: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
      findMany: jest.fn<(args: unknown) => Promise<FeedbackResponseDto[]>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
      update: jest.fn<(args: unknown) => Promise<FeedbackResponseDto>>(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  const feedback: FeedbackResponseDto = {
    id: 'feedback-1',
    category: 'BROKEN_LINK',
    section: 'RESOURCES',
    careerId: 'career-1',
    description: 'Step 2 course link is dead.',
    userEmail: 'ada@example.com',
    platform: 'WEB',
    status: 'NEW',
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
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

  describe('getFeedback', () => {
    beforeEach(() => {
      mockPrismaService.contentFeedback.findMany.mockResolvedValue([feedback]);
      mockPrismaService.contentFeedback.count.mockResolvedValue(41);
    });

    it('returns the requested page newest first with the total count', async () => {
      const result = await service.getFeedback({ page: 3, limit: 20 });

      expect(mockPrismaService.contentFeedback.findMany).toHaveBeenCalledWith({
        where: { status: undefined, careerId: undefined },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 40,
        take: 20,
      });
      expect(mockPrismaService.contentFeedback.count).toHaveBeenCalledWith({
        where: { status: undefined, careerId: undefined },
      });
      expect(result).toEqual({
        items: [feedback],
        total: 41,
        page: 3,
        limit: 20,
      });
    });

    it('filters the page and the count by status and career', async () => {
      await service.getFeedback({
        status: 'RESOLVED',
        careerId: 'career-1',
        page: 1,
        limit: 10,
      });

      const where = { status: 'RESOLVED', careerId: 'career-1' };
      expect(mockPrismaService.contentFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 0, take: 10 }),
      );
      expect(mockPrismaService.contentFeedback.count).toHaveBeenCalledWith({
        where,
      });
    });
  });

  describe('updateFeedbackStatus', () => {
    it('updates the status and returns the updated record', async () => {
      const updated = { ...feedback, status: 'UNDER_REVIEW' as const };
      mockPrismaService.contentFeedback.update.mockResolvedValue(updated);

      const result = await service.updateFeedbackStatus('feedback-1', {
        status: 'UNDER_REVIEW',
      });

      expect(mockPrismaService.contentFeedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-1' },
        data: { status: 'UNDER_REVIEW' },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the feedback does not exist', async () => {
      mockPrismaService.contentFeedback.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateFeedbackStatus('missing', { status: 'RESOLVED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.contentFeedback.update.mockRejectedValue(failure);

      await expect(
        service.updateFeedbackStatus('feedback-1', { status: 'RESOLVED' }),
      ).rejects.toBe(failure);
    });
  });
});
