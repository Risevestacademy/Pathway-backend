import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';

describe('FeedbackController', () => {
  let controller: FeedbackController;

  const mockFeedbackService = {
    submitFeedback:
      jest.fn<(dto: CreateFeedbackDto) => Promise<CreateFeedbackResponseDto>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [{ provide: FeedbackService, useValue: mockFeedbackService }],
    }).compile();

    controller = module.get<FeedbackController>(FeedbackController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('submitFeedback', () => {
    it('passes the body to feedbackService.submitFeedback and returns its result', async () => {
      const dto: CreateFeedbackDto = {
        category: 'BROKEN_LINK',
        description: 'Step 3 link is dead.',
        section: 'RESOURCES',
        careerId: 'career-1',
      };
      const response = { message: 'Feedback received' };
      mockFeedbackService.submitFeedback.mockResolvedValue(response);

      const result = await controller.submitFeedback(dto);

      expect(mockFeedbackService.submitFeedback).toHaveBeenCalledWith(dto);
      expect(result).toEqual(response);
    });
  });
});
