import {
  FeedbackCategory,
  FeedbackSection,
  FeedbackStatus,
  FeedbackTargetType,
} from '../generated/prisma/client';
import { PUBLIC_FEEDBACK_SELECT, toPublicFeedback } from './feedback-public';

describe('feedback public mapper', () => {
  const row = {
    id: 'feedback-1',
    category: FeedbackCategory.BROKEN_LINK,
    section: FeedbackSection.RESOURCES,
    targetType: FeedbackTargetType.PATHWAY_STEP,
    targetId: 'step-1',
    description: 'Step 3 link is dead.',
    status: FeedbackStatus.NEW,
    createdAt: new Date('2026-11-12T10:00:00.000Z'),
  };

  it('maps the fields a reporter can see', () => {
    expect(toPublicFeedback(row)).toEqual({
      id: 'feedback-1',
      category: 'BROKEN_LINK',
      section: 'RESOURCES',
      targetType: 'PATHWAY_STEP',
      targetId: 'step-1',
      description: 'Step 3 link is dead.',
      status: 'NEW',
      createdAt: new Date('2026-11-12T10:00:00.000Z'),
    });
  });

  it('never includes notes, even when the row carries them', () => {
    const withNotes = {
      ...row,
      notes: [{ id: 'note-1', body: 'internal only' }],
      userEmail: 'ada@example.com',
      resolution: 'FIXED',
    };

    const result = toPublicFeedback(withNotes);

    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('userEmail');
    expect(result).not.toHaveProperty('resolution');
    expect(JSON.stringify(result)).not.toContain('internal only');
  });

  it('reads a missing targetType as OTHER', () => {
    expect(
      toPublicFeedback({ ...row, targetType: null, targetId: null }),
    ).toMatchObject({ targetType: 'OTHER', targetId: null });
  });

  it('never selects notes or the reporter email', () => {
    expect(PUBLIC_FEEDBACK_SELECT).not.toHaveProperty('notes');
    expect(PUBLIC_FEEDBACK_SELECT).not.toHaveProperty('userEmail');
  });
});
