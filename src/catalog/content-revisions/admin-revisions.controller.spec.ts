import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import {
  ReviewDecision,
  RevisionStatus,
  Role,
} from '../../generated/prisma/client';
import { AdminRevisionsController } from './admin-revisions.controller';
import { RevisionsService } from './content-revisions.service';
import type { ReviewRevisionDto } from './dto/review-revision.dto';
import type { ReviewRevisionResponseDto } from './dto/review-revision-response.dto';
import type { RecallRevisionResponseDto } from './dto/recall-revision-response.dto';

describe('AdminRevisionsController', () => {
  let controller: AdminRevisionsController;

  const mockRevisionsService = {
    reviewRevision:
      jest.fn<
        (
          revisionId: string,
          reviewer: { id: string; role: Role },
          dto: ReviewRevisionDto,
        ) => Promise<ReviewRevisionResponseDto>
      >(),
    recallRevision:
      jest.fn<
        (
          revisionId: string,
          actor: { id: string; role: Role },
        ) => Promise<RecallRevisionResponseDto>
      >(),
  };

  const reviewer: AuthenticatedUser = {
    id: 'reviewer-1',
    email: 'reviewer@example.com',
    role: Role.REVIEWER,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRevisionsController],
      providers: [
        { provide: RevisionsService, useValue: mockRevisionsService },
      ],
    }).compile();

    controller = module.get(AdminRevisionsController);
  });

  describe('review', () => {
    it('passes the id, the reviewer and the body to the service and returns its result', async () => {
      const dto: ReviewRevisionDto = {
        decision: ReviewDecision.APPROVED,
        note: 'Looks good',
      };
      const response: ReviewRevisionResponseDto = {
        id: 'review-1',
        revisionId: 'revision-1',
        decision: ReviewDecision.APPROVED,
        note: 'Looks good',
        revisionStatus: RevisionStatus.APPROVED,
        createdAt: new Date(),
      };
      mockRevisionsService.reviewRevision.mockResolvedValue(response);

      const result = await controller.review('revision-1', dto, reviewer);

      expect(mockRevisionsService.reviewRevision).toHaveBeenCalledWith(
        'revision-1',
        { id: 'reviewer-1', role: Role.REVIEWER },
        dto,
      );
      expect(result).toBe(response);
    });
  });

  describe('recall', () => {
    it('passes the id and the actor to the service and returns its result', async () => {
      const editor: AuthenticatedUser = {
        id: 'editor-1',
        email: 'editor@example.com',
        role: Role.EDITOR,
      };
      const response: RecallRevisionResponseDto = {
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.DRAFT,
        baseVersion: 3,
        updatedAt: new Date(),
      };
      mockRevisionsService.recallRevision.mockResolvedValue(response);

      const result = await controller.recall('revision-1', editor);

      expect(mockRevisionsService.recallRevision).toHaveBeenCalledWith(
        'revision-1',
        { id: 'editor-1', role: Role.EDITOR },
      );
      expect(result).toBe(response);
    });
  });
});
