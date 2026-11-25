import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common';
import { Role } from '../generated/prisma/client';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';

describe('FeedbackController', () => {
  let controller: FeedbackController;

  const mockFeedbackService = {
    submitFeedback:
      jest.fn<
        (
          dto: CreateFeedbackDto,
          actor: AuthenticatedUser | null,
        ) => Promise<CreateFeedbackResponseDto>
      >(),
  };

  const requestOf = (user?: AuthenticatedUser) =>
    ({ user }) as unknown as Request & { user?: AuthenticatedUser };

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
    const dto: CreateFeedbackDto = {
      category: 'BROKEN_LINK',
      description: 'Step 3 link is dead.',
      section: 'RESOURCES',
      careerId: 'career-1',
    };
    const response = { message: 'Feedback received' };

    beforeEach(() => {
      mockFeedbackService.submitFeedback.mockResolvedValue(response);
    });

    it('passes the body and no caller for an anonymous request, and returns the result', async () => {
      const result = await controller.submitFeedback(dto, requestOf());

      expect(mockFeedbackService.submitFeedback).toHaveBeenCalledWith(
        dto,
        null,
      );
      expect(result).toEqual(response);
    });

    it('passes the signed-in caller to the service', async () => {
      const user: AuthenticatedUser = {
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
      };

      const result = await controller.submitFeedback(dto, requestOf(user));

      expect(mockFeedbackService.submitFeedback).toHaveBeenCalledWith(
        dto,
        user,
      );
      expect(result).toEqual(response);
    });
  });
});
