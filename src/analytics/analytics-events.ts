export type SignUpMethod = 'email' | 'google';
export type LoginMethod = 'password' | 'google';

/**
 * Event name -> property shape.
 * `undefined` means the event has no properties.
 */
export interface AnalyticsEventMap {
  user_signed_up: { method: SignUpMethod };
  user_logged_in: { method: LoginMethod };
  email_verified: undefined;
  password_reset_completed: undefined;
  pathway_saved: { careerId: string };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/**
 * Extracts the property type for a given event name.
 * Resolves to `never` when the event accepts no properties.
 */
export type AnalyticsEventProps<K extends AnalyticsEventName> =
  AnalyticsEventMap[K] extends undefined ? never : AnalyticsEventMap[K];

/** Events that take no properties — capture() omits the properties argument. */
export type EventsWithoutProps = {
  [K in AnalyticsEventName]: AnalyticsEventMap[K] extends undefined ? K : never;
}[AnalyticsEventName];
