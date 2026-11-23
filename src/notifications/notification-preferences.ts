import { NotificationCategory } from '../generated/prisma/client';

export type NotificationChannel = 'inApp' | 'email';

export interface ChannelPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export type NotificationPreferenceMap = Record<
  NotificationCategory,
  ChannelPreference
>;

export interface StoredPreference extends ChannelPreference {
  category: NotificationCategory;
}

// The settings page defaults: resource-link and streak emails off, the rest on
export const NOTIFICATION_CATEGORY_DEFAULTS: Readonly<NotificationPreferenceMap> =
  {
    [NotificationCategory.ROADMAP_UPDATES]: {
      inAppEnabled: true,
      emailEnabled: true,
    },
    [NotificationCategory.NEW_OPENINGS]: {
      inAppEnabled: true,
      emailEnabled: true,
    },
    [NotificationCategory.FEEDBACK_REPLIES]: {
      inAppEnabled: true,
      emailEnabled: true,
    },
    [NotificationCategory.RESOURCE_LINK_PROBLEMS]: {
      inAppEnabled: true,
      emailEnabled: false,
    },
    [NotificationCategory.LEARNING_REMINDERS]: {
      inAppEnabled: true,
      emailEnabled: true,
    },
    [NotificationCategory.STREAK_NUDGES]: {
      inAppEnabled: true,
      emailEnabled: false,
    },
  };

// Stored rows win over the defaults; every category is always present
export const mergePreferences = (
  rows: readonly StoredPreference[],
): NotificationPreferenceMap => {
  const stored = new Map(rows.map((row) => [row.category, row]));

  const preferenceFor = (category: NotificationCategory): ChannelPreference => {
    const row = stored.get(category);
    return row
      ? { inAppEnabled: row.inAppEnabled, emailEnabled: row.emailEnabled }
      : { ...NOTIFICATION_CATEGORY_DEFAULTS[category] };
  };

  return {
    [NotificationCategory.ROADMAP_UPDATES]: preferenceFor(
      NotificationCategory.ROADMAP_UPDATES,
    ),
    [NotificationCategory.NEW_OPENINGS]: preferenceFor(
      NotificationCategory.NEW_OPENINGS,
    ),
    [NotificationCategory.FEEDBACK_REPLIES]: preferenceFor(
      NotificationCategory.FEEDBACK_REPLIES,
    ),
    [NotificationCategory.RESOURCE_LINK_PROBLEMS]: preferenceFor(
      NotificationCategory.RESOURCE_LINK_PROBLEMS,
    ),
    [NotificationCategory.LEARNING_REMINDERS]: preferenceFor(
      NotificationCategory.LEARNING_REMINDERS,
    ),
    [NotificationCategory.STREAK_NUDGES]: preferenceFor(
      NotificationCategory.STREAK_NUDGES,
    ),
  };
};

export const isChannelEnabled = (
  preference: ChannelPreference,
  channel: NotificationChannel,
): boolean =>
  channel === 'inApp' ? preference.inAppEnabled : preference.emailEnabled;
