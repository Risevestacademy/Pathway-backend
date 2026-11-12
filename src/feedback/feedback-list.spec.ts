import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSection,
  FeedbackStatus,
  FeedbackTargetType,
} from '../generated/prisma/client';
import {
  buildFeedbackListWhere,
  FEEDBACK_LIST_SELECT,
  type FeedbackListRow,
  SNIPPET_MAX_LENGTH,
  targetKey,
  toAdminFeedbackListItem,
  toSnippet,
} from './feedback-list';

describe('feedback list', () => {
  const row: FeedbackListRow = {
    id: 'feedback-1',
    category: FeedbackCategory.BROKEN_LINK,
    section: FeedbackSection.RESOURCES,
    status: FeedbackStatus.NEW,
    resolution: null,
    description: 'Step 3 link is dead.',
    userEmail: 'ada@example.com',
    platform: FeedbackPlatform.WEB,
    targetType: FeedbackTargetType.PATHWAY_STEP,
    targetId: 'step-1',
    createdAt: new Date('2026-11-12T10:00:00.000Z'),
  };

  describe('buildFeedbackListWhere', () => {
    it('passes every filter through', () => {
      expect(
        buildFeedbackListWhere({
          status: 'RESOLVED',
          category: 'BROKEN_LINK',
          targetType: 'RESOURCE',
          careerId: 'career-1',
        }),
      ).toEqual({
        status: 'RESOLVED',
        category: 'BROKEN_LINK',
        targetType: 'RESOURCE',
        careerId: 'career-1',
      });
    });

    it('leaves a filter out when it is not sent', () => {
      expect(buildFeedbackListWhere({ status: 'NEW' })).toEqual({
        status: 'NEW',
      });
    });
  });

  describe('toSnippet', () => {
    it('keeps a short description as it is, trimmed', () => {
      expect(toSnippet('  Link is dead.  ')).toBe('Link is dead.');
    });

    it('keeps a description of exactly the maximum length', () => {
      const text = 'a'.repeat(SNIPPET_MAX_LENGTH);

      expect(toSnippet(text)).toBe(text);
    });

    it('cuts a long description at a word and adds an ellipsis', () => {
      const snippet = toSnippet('word '.repeat(60));

      expect(snippet.endsWith('word…')).toBe(true);
      expect(snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_LENGTH + 1);
    });

    it('cuts a long description with no spaces at the maximum length', () => {
      expect(toSnippet('a'.repeat(300))).toBe(
        `${'a'.repeat(SNIPPET_MAX_LENGTH)}…`,
      );
    });
  });

  describe('toAdminFeedbackListItem', () => {
    it('maps the fields the Reports table needs', () => {
      expect(toAdminFeedbackListItem(row, 'Step 3: SQL basics')).toEqual({
        id: 'feedback-1',
        category: 'BROKEN_LINK',
        section: 'RESOURCES',
        status: 'NEW',
        resolution: null,
        snippet: 'Step 3 link is dead.',
        target: {
          type: 'PATHWAY_STEP',
          id: 'step-1',
          label: 'Step 3: SQL basics',
        },
        reporterEmail: 'ada@example.com',
        platform: 'WEB',
        createdAt: new Date('2026-11-12T10:00:00.000Z'),
      });
    });

    it('sends the snippet, not the full description', () => {
      const long = 'word '.repeat(60).trim();

      const item = toAdminFeedbackListItem({ ...row, description: long }, null);

      expect(item).not.toHaveProperty('description');
      expect(item.snippet).not.toBe(long);
    });

    it('keeps a missing label null', () => {
      expect(toAdminFeedbackListItem(row, null).target.label).toBeNull();
    });

    it('reads a missing targetType as OTHER with no id', () => {
      expect(
        toAdminFeedbackListItem(
          { ...row, targetType: null, targetId: null },
          null,
        ).target,
      ).toEqual({ type: 'OTHER', id: null, label: null });
    });
  });

  describe('FEEDBACK_LIST_SELECT', () => {
    it('never selects notes', () => {
      expect(FEEDBACK_LIST_SELECT).not.toHaveProperty('notes');
    });
  });

  describe('targetKey', () => {
    it('joins the type and id', () => {
      expect(targetKey('CAREER', 'career-1')).toBe('CAREER:career-1');
    });
  });
});
