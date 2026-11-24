import { isUUID } from 'class-validator';
import type { Prisma } from '../generated/prisma/client';

export const NOTIFICATION_PAGE_DEFAULT_LIMIT = 20;
export const NOTIFICATION_PAGE_MAX_LIMIT = 50;

export const NOTIFICATION_FILTERS = ['all', 'unread'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export const notificationItemSelect = {
  id: true,
  type: true,
  category: true,
  title: true,
  body: true,
  isRead: true,
  readAt: true,
  targetType: true,
  targetId: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationItemRow = Prisma.NotificationGetPayload<{
  select: typeof notificationItemSelect;
}>;

const CURSOR_SEPARATOR = '_';

export const encodeNotificationCursor = ({
  createdAt,
  id,
}: NotificationCursor): string =>
  Buffer.from(
    `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`,
    'utf8',
  ).toString('base64url');

export const decodeNotificationCursor = (
  cursor: string,
): NotificationCursor | null => {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const [iso, id, ...rest] = decoded.split(CURSOR_SEPARATOR);
  if (rest.length > 0 || !iso || !id || !isUUID(id)) return null;

  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso)
    return null;

  return { createdAt, id };
};

export const resolveNotificationLimit = (limit?: number): number =>
  Math.min(
    limit ?? NOTIFICATION_PAGE_DEFAULT_LIMIT,
    NOTIFICATION_PAGE_MAX_LIMIT,
  );

// Rows strictly after the cursor in (createdAt, id) descending order
export const afterCursorWhere = ({
  createdAt,
  id,
}: NotificationCursor): Prisma.NotificationWhereInput => ({
  OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
});

// Expects up to limit + 1 rows; the extra row only signals a next page
export const toNotificationPage = (
  rows: readonly NotificationItemRow[],
  limit: number,
): { items: NotificationItemRow[]; nextCursor: string | null } => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      rows.length > limit && last ? encodeNotificationCursor(last) : null,
  };
};
