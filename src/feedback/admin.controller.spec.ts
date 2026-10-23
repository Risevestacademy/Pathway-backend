import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { FeedbackService } from './feedback.service';
import type { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import type { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import type { FeedbackResponseDto } from './dto/feedback-response.dto';
import type { FeedbackListResponseDto } from './dto/feedback-list-response.dto';

describe('AdminController', () => {
  let controller: AdminController;

  const mockFeedbackService = {
    getFeedback:
      jest.fn<
        (query: GetFeedbackQueryDto) => Promise<FeedbackListResponseDto>
      >(),
    updateFeedbackStatus:
      jest.fn<
        (
          id: string,
          dto: UpdateFeedbackStatusDto,
        ) => Promise<FeedbackResponseDto>
      >(),
  };

  const feedback: FeedbackResponseDto = {
    id: 'feedback-1',
    category: 'OTHER',
    section: 'GENERAL',
    careerId: null,
    description: 'Love it.',
    userEmail: null,
    platform: null,
    status: 'RESOLVED',
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-21T10:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: FeedbackService, useValue: mockFeedbackService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFeedback', () => {
    it('should pass the query to feedbackService.getFeedback and return its result', async () => {
      const query: GetFeedbackQueryDto = { status: 'NEW', page: 2, limit: 5 };
      const list: FeedbackListResponseDto = {
        items: [feedback],
        total: 6,
        page: 2,
        limit: 5,
      };
      mockFeedbackService.getFeedback.mockResolvedValue(list);

      const result = await controller.getFeedback(query);

      expect(mockFeedbackService.getFeedback).toHaveBeenCalledWith(query);
      expect(result).toEqual(list);
    });
  });

  describe('updateFeedbackStatus', () => {
    it('should pass the id and body to feedbackService.updateFeedbackStatus and return its result', async () => {
      mockFeedbackService.updateFeedbackStatus.mockResolvedValue(feedback);

      const result = await controller.updateFeedbackStatus('feedback-1', {
        status: 'RESOLVED',
      });

      expect(mockFeedbackService.updateFeedbackStatus).toHaveBeenCalledWith(
        'feedback-1',
        { status: 'RESOLVED' },
      );
      expect(result).toEqual(feedback);
    });
  });
});
