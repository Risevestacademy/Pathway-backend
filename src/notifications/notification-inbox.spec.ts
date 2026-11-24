import {
  NotificationCategory,
  NotificationType,
} from '../generated/prisma/client';
import {
  afterCursorWhere,
  decodeNotificationCursor,
  encodeNotificationCursor,
  type NotificationItemRow,
  resolveNotificationLimit,
  toNotificationPage,
} from './notification-inbox';

const ID_A = '0b7a6f3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b';
const ID_B = '5d2c8a41-7e3b-4f6a-9c0d-2b1e4f7a8c93';
const CREATED_AT = new Date('2026-11-24T09:15:30.123Z');

const row = (id: string, createdAt = CREATED_AT): NotificationItemRow => ({
  id,
  type: NotificationType.FEEDBACK_REPLIED,
  category: NotificationCategory.FEEDBACK_REPLIES,
  title: 'We replied to your feedback',
  body: 'Our team replied to feedback you sent. Open it to read the reply.',
  isRead: false,
  readAt: null,
  targetType: null,
  targetId: null,
  createdAt,
});

describe('notification cursor', () => {
  it('round-trips the creation time and id', () => {
    const cursor = encodeNotificationCursor({
      createdAt: CREATED_AT,
      id: ID_A,
    });

    expect(decodeNotificationCursor(cursor)).toEqual({
      createdAt: CREATED_AT,
      id: ID_A,
    });
  });

  it.each([
    ['not base64 of anything', 'not-a-cursor'],
    [
      'a bad id',
      Buffer.from(`${CREATED_AT.toISOString()}_abc`).toString('base64url'),
    ],
    ['a bad date', Buffer.from(`yesterday_${ID_A}`).toString('base64url')],
    [
      'extra parts',
      Buffer.from(`${CREATED_AT.toISOString()}_${ID_A}_x`).toString(
        'base64url',
      ),
    ],
    ['an empty string', ''],
  ])('rejects %s', (_, cursor) => {
    expect(decodeNotificationCursor(cursor)).toBeNull();
  });
});

describe('resolveNotificationLimit', () => {
  it('defaults to 20 and caps at 50', () => {
    expect(resolveNotificationLimit()).toBe(20);
    expect(resolveNotificationLimit(5)).toBe(5);
    expect(resolveNotificationLimit(80)).toBe(50);
  });
});

describe('afterCursorWhere', () => {
  it('takes older rows, and rows with the same time and a lower id', () => {
    expect(afterCursorWhere({ createdAt: CREATED_AT, id: ID_B })).toEqual({
      OR: [
        { createdAt: { lt: CREATED_AT } },
        { createdAt: CREATED_AT, id: { lt: ID_B } },
      ],
    });
  });
});

describe('toNotificationPage', () => {
  it('returns no cursor when there is no extra row', () => {
    expect(toNotificationPage([row(ID_B), row(ID_A)], 2)).toEqual({
      items: [row(ID_B), row(ID_A)],
      nextCursor: null,
    });
  });

  it('drops the extra row and points the cursor at the last item kept', () => {
    const page = toNotificationPage([row(ID_B), row(ID_A)], 1);

    expect(page.items).toEqual([row(ID_B)]);
    expect(decodeNotificationCursor(page.nextCursor ?? '')).toEqual({
      createdAt: CREATED_AT,
      id: ID_B,
    });
  });

  it('returns an empty page with no cursor', () => {
    expect(toNotificationPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
