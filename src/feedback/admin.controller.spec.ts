import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { FeedbackService } from './feedback.service';
import type { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import type { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import type { FeedbackResponseDto } from './dto/feedback-response.dto';
import type { FeedbackListResponseDto } from './dto/feedback-list-response.dto';
import type { AdminFeedbackDetailDto } from './dto/admin-feedback-detail.dto';
import type { FeedbackNoteDto } from './dto/feedback-note.dto';
import type { AuthenticatedUser } from '../common';

describe('AdminController', () => {
  let controller: AdminController;

  const mockFeedbackService = {
    getFeedback:
      jest.fn<
        (query: GetFeedbackQueryDto) => Promise<FeedbackListResponseDto>
      >(),
    getFeedbackDetail:
      jest.fn<(id: string) => Promise<AdminFeedbackDetailDto>>(),
    triageFeedback:
      jest.fn<
        (
          id: string,
          actorId: string,
          input: { status: string; resolution?: string | null },
        ) => Promise<AdminFeedbackDetailDto>
      >(),
    addNote:
      jest.fn<
        (id: string, actorId: string, body: string) => Promise<FeedbackNoteDto>
      >(),
    updateFeedbackStatus:
      jest.fn<
        (
          id: string,
          dto: UpdateFeedbackStatusDto,
        ) => Promise<FeedbackResponseDto>
      >(),
  };

  const admin = { id: 'admin-1' } as AuthenticatedUser;

  const note: FeedbackNoteDto = {
    id: 'note-1',
    feedbackId: 'feedback-1',
    authorId: 'admin-1',
    body: 'Checked with the content team.',
    createdAt: new Date('2026-11-12T10:00:00.000Z'),
  };

  const detail: AdminFeedbackDetailDto = {
    id: 'feedback-1',
    category: 'OTHER',
    section: 'GENERAL',
    careerId: null,
    status: 'RESOLVED',
    resolution: 'FIXED',
    description: 'Love it.',
    userEmail: null,
    snippet: 'Love it.',
    target: { type: 'OTHER', id: null, label: null },
    platform: null,
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-21T10:00:00.000Z'),
    notes: [note],
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
      const query: GetFeedbackQueryDto = {
        status: 'NEW',
        category: 'BROKEN_LINK',
        targetType: 'PATHWAY_STEP',
        page: 2,
        limit: 5,
      };
      const list: FeedbackListResponseDto = {
        items: [
          {
            id: 'feedback-1',
            category: 'BROKEN_LINK',
            section: 'RESOURCES',
            careerId: 'career-1',
            status: 'NEW',
            resolution: null,
            description: 'Step 3 link is dead.',
            userEmail: null,
            snippet: 'Step 3 link is dead.',
            target: { type: 'PATHWAY_STEP', id: 'step-1', label: 'SQL basics' },
            platform: 'WEB',
            createdAt: new Date('2026-10-20T10:00:00.000Z'),
            updatedAt: new Date('2026-10-20T10:00:00.000Z'),
          },
        ],
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

  describe('getFeedbackDetail', () => {
    it('should pass the id to feedbackService.getFeedbackDetail and return its result', async () => {
      mockFeedbackService.getFeedbackDetail.mockResolvedValue(detail);

      const result = await controller.getFeedbackDetail('feedback-1');

      expect(mockFeedbackService.getFeedbackDetail).toHaveBeenCalledWith(
        'feedback-1',
      );
      expect(result).toEqual(detail);
    });
  });

  describe('updateFeedback', () => {
    it('should pass the id, the acting admin and the body to feedbackService.triageFeedback', async () => {
      mockFeedbackService.triageFeedback.mockResolvedValue(detail);

      const result = await controller.updateFeedback(
        'feedback-1',
        { status: 'RESOLVED', resolution: 'FIXED' },
        admin,
      );

      expect(mockFeedbackService.triageFeedback).toHaveBeenCalledWith(
        'feedback-1',
        'admin-1',
        { status: 'RESOLVED', resolution: 'FIXED' },
      );
      expect(result).toEqual(detail);
    });
  });

  describe('addNote', () => {
    it('should pass the id, the acting admin and the body text to feedbackService.addNote', async () => {
      mockFeedbackService.addNote.mockResolvedValue(note);

      const result = await controller.addNote(
        'feedback-1',
        { body: 'Checked with the content team.' },
        admin,
      );

      expect(mockFeedbackService.addNote).toHaveBeenCalledWith(
        'feedback-1',
        'admin-1',
        'Checked with the content team.',
      );
      expect(result).toEqual(note);
    });
  });
});
