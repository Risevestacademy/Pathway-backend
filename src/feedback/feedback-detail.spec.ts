import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSection,
  FeedbackStatus,
  FeedbackTargetType,
} from '../generated/prisma/client';
import { PUBLIC_FEEDBACK_SELECT, toPublicFeedback } from './feedback-public';
import {
  FEEDBACK_DETAIL_SELECT,
  type FeedbackDetailRow,
  toAdminFeedbackDetail,
} from './feedback-detail';

describe('feedback detail', () => {
  const createdAt = new Date('2026-11-12T10:00:00.000Z');
  const notes = [
    {
      id: 'note-1',
      feedbackId: 'feedback-1',
      authorId: 'admin-1',
      body: 'Checked with the content team.',
      createdAt,
    },
  ];
  const row: FeedbackDetailRow = {
    id: 'feedback-1',
    category: FeedbackCategory.BROKEN_LINK,
    section: FeedbackSection.RESOURCES,
    careerId: 'career-1',
    status: FeedbackStatus.NEW,
    resolution: null,
    description: 'Step 3 link is dead.',
    userEmail: 'ada@example.com',
    platform: FeedbackPlatform.WEB,
    targetType: FeedbackTargetType.PATHWAY_STEP,
    targetId: 'step-1',
    createdAt,
    updatedAt: createdAt,
    notes,
  };

  describe('FEEDBACK_DETAIL_SELECT', () => {
    it('reads notes oldest first', () => {
      expect(FEEDBACK_DETAIL_SELECT.notes.orderBy).toEqual([
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
    });
  });

  describe('toAdminFeedbackDetail', () => {
    it('adds the notes to the list item fields', () => {
      const detail = toAdminFeedbackDetail(row, 'Step 3: SQL basics');

      expect(detail).toMatchObject({
        id: 'feedback-1',
        snippet: 'Step 3 link is dead.',
        description: 'Step 3 link is dead.',
        target: {
          type: 'PATHWAY_STEP',
          id: 'step-1',
          label: 'Step 3: SQL basics',
        },
        notes,
      });
    });
  });

  describe('public response', () => {
    it('never selects notes', () => {
      expect(PUBLIC_FEEDBACK_SELECT).not.toHaveProperty('notes');
    });

    it('never maps notes, even when the row carries them', () => {
      const publicItem = toPublicFeedback(row);

      expect(publicItem).not.toHaveProperty('notes');
      expect(JSON.stringify(publicItem)).not.toContain('content team');
    });
  });
});
