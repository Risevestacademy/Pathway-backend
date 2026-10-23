import { FeedbackCategory } from '../generated/prisma/client';
import { FEEDBACK_CATEGORY_LABELS } from './feedback.constants';

describe('FEEDBACK_CATEGORY_LABELS', () => {
  it('has a non-empty label for every feedback category', () => {
    for (const category of Object.values(FeedbackCategory)) {
      expect(FEEDBACK_CATEGORY_LABELS[category]).toEqual(expect.any(String));
      expect(FEEDBACK_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });
});
