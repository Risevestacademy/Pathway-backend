import { NotificationCategory } from '../generated/prisma/client';
import {
  isChannelEnabled,
  mergePreferences,
  NOTIFICATION_CATEGORY_DEFAULTS,
} from './notification-preferences';

describe('NOTIFICATION_CATEGORY_DEFAULTS', () => {
  it('covers every category', () => {
    expect(Object.keys(NOTIFICATION_CATEGORY_DEFAULTS).sort()).toEqual(
      Object.values(NotificationCategory).sort(),
    );
  });

  it('matches the settings design: resource-link and streak email off, the rest on', () => {
    expect(NOTIFICATION_CATEGORY_DEFAULTS).toEqual({
      ROADMAP_UPDATES: { inAppEnabled: true, emailEnabled: true },
      NEW_OPENINGS: { inAppEnabled: true, emailEnabled: true },
      FEEDBACK_REPLIES: { inAppEnabled: true, emailEnabled: true },
      RESOURCE_LINK_PROBLEMS: { inAppEnabled: true, emailEnabled: false },
      LEARNING_REMINDERS: { inAppEnabled: true, emailEnabled: true },
      STREAK_NUDGES: { inAppEnabled: true, emailEnabled: false },
    });
  });
});

describe('mergePreferences', () => {
  it('returns the defaults when the user has no rows', () => {
    expect(mergePreferences([])).toEqual(NOTIFICATION_CATEGORY_DEFAULTS);
  });

  it('applies stored rows over the defaults and keeps the other categories', () => {
    const merged = mergePreferences([
      {
        category: NotificationCategory.STREAK_NUDGES,
        inAppEnabled: false,
        emailEnabled: true,
      },
    ]);

    expect(merged.STREAK_NUDGES).toEqual({
      inAppEnabled: false,
      emailEnabled: true,
    });
    expect(merged.FEEDBACK_REPLIES).toEqual(
      NOTIFICATION_CATEGORY_DEFAULTS.FEEDBACK_REPLIES,
    );
  });

  it('never changes the defaults', () => {
    const merged = mergePreferences([]);
    merged.NEW_OPENINGS.inAppEnabled = false;

    expect(NOTIFICATION_CATEGORY_DEFAULTS.NEW_OPENINGS.inAppEnabled).toBe(true);
  });
});

describe('isChannelEnabled', () => {
  it('reads the requested channel', () => {
    const preference = { inAppEnabled: true, emailEnabled: false };

    expect(isChannelEnabled(preference, 'inApp')).toBe(true);
    expect(isChannelEnabled(preference, 'email')).toBe(false);
  });
});
