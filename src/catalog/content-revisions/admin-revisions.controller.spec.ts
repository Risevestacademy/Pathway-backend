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
});
