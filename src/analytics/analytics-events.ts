import type {
  CareerStatus,
  ReviewDecision,
  Role,
} from '../generated/prisma/enums';

export type SignUpMethod = 'email' | 'google';
export type LoginMethod = 'password' | 'google';
export type StepCompletionStatus = 'COMPLETED' | 'NOT_STARTED';
export type PasswordResetChannel = 'link' | 'otp';

/**
 * Event name -> property shape.
 * `undefined` means the event has no properties.
 */
export interface AnalyticsEventMap {
  user_signed_up: { method: SignUpMethod };
  user_logged_in: { method: LoginMethod };
  email_verified: undefined;
  password_reset_completed: { channel: PasswordResetChannel };
  pathway_saved: { careerId: string };
  step_completion_changed: {
    careerId: string;
    stepId: string;
    status: StepCompletionStatus;
  };
  staff_invite_sent: { role: Role };
  staff_invite_revoked: { role: Role };
  staff_invite_accepted: { role: Role };
  career_deleted: { careerId: string };
  revision_rebased: {
    revisionId: string;
    careerId: string;
    newBaseVersion: number;
  };
  revision_reviewed: {
    revisionId: string;
    careerId: string;
    decision: ReviewDecision;
  };
  revision_published: {
    revisionId: string;
    careerId: string;
    newVersion: number;
  };
  career_status_changed: { oldStatus: CareerStatus; newStatus: CareerStatus };
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
