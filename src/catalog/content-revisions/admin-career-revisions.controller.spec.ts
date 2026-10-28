import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { AdminCareerRevisionsController } from './admin-career-revisions.controller';
import { RevisionsService } from './content-revisions.service';
import type { CareerSnapshot } from './career-snapshot.types';
import type { SaveDraftRevisionDto } from './dto/save-draft-revision.dto';
import type { SaveDraftRevisionResponseDto } from './dto/save-draft-revision-response.dto';

describe('AdminCareerRevisionsController', () => {
  let controller: AdminCareerRevisionsController;

  const mockRevisionsService = {
    saveDraftRevision:
      jest.fn<
        (
          careerId: string,
          snapshot: CareerSnapshot,
          actorUserId: string,
        ) => Promise<SaveDraftRevisionResponseDto>
      >(),
  };

  const editor: AuthenticatedUser = {
    id: 'editor-1',
    email: 'editor@example.com',
    role: 'EDITOR',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCareerRevisionsController],
      providers: [
        { provide: RevisionsService, useValue: mockRevisionsService },
      ],
    }).compile();

    controller = module.get(AdminCareerRevisionsController);
  });

  it("passes the career id, snapshot and actor's id to saveDraftRevision and returns its result", async () => {
    const snapshot = { schemaVersion: 1 } as SaveDraftRevisionDto;
    const saved = { id: 'revision-1' } as SaveDraftRevisionResponseDto;
    mockRevisionsService.saveDraftRevision.mockResolvedValue(saved);

    const result = await controller.saveDraftRevision(
      'career-1',
      snapshot,
      editor,
    );

    expect(mockRevisionsService.saveDraftRevision).toHaveBeenCalledWith(
      'career-1',
      snapshot,
      'editor-1',
    );
    expect(result).toBe(saved);
  });
});
