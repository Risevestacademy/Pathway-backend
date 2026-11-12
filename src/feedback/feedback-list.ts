import { FeedbackTargetType, type Prisma } from '../generated/prisma/client';
import type { AdminFeedbackListItemDto } from './dto/admin-feedback-list-item.dto';
import type { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';

export const SNIPPET_MAX_LENGTH = 120;

// Left out on purpose: notes, which the Reports table does not show
export const FEEDBACK_LIST_SELECT = {
  id: true,
  category: true,
  section: true,
  status: true,
  resolution: true,
  description: true,
  userEmail: true,
  platform: true,
  targetType: true,
  targetId: true,
  createdAt: true,
} satisfies Prisma.ContentFeedbackSelect;

export type FeedbackListRow = Prisma.ContentFeedbackGetPayload<{
  select: typeof FEEDBACK_LIST_SELECT;
}>;

// A filter left out matches everything
export const buildFeedbackListWhere = ({
  status,
  category,
  targetType,
  careerId,
}: Pick<
  GetFeedbackQueryDto,
  'status' | 'category' | 'targetType' | 'careerId'
>): Prisma.ContentFeedbackWhereInput => ({
  status,
  category,
  targetType,
  careerId,
});

export const toSnippet = (description: string): string => {
  const text = description.trim();
  if (text.length <= SNIPPET_MAX_LENGTH) return text;

  const cut = text.slice(0, SNIPPET_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export const targetKey = (type: FeedbackTargetType, id: string): string =>
  `${type}:${id}`;

export const toAdminFeedbackListItem = (
  row: FeedbackListRow,
  label: string | null,
): AdminFeedbackListItemDto => ({
  id: row.id,
  category: row.category,
  section: row.section,
  status: row.status,
  resolution: row.resolution,
  snippet: toSnippet(row.description),
  target: {
    type: row.targetType ?? FeedbackTargetType.OTHER,
    id: row.targetId,
    label,
  },
  reporterEmail: row.userEmail,
  platform: row.platform,
  createdAt: row.createdAt,
});
