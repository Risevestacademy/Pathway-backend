import type {
  FeedbackResolution,
  FeedbackStatus,
  FeedbackTargetType,
} from '../generated/prisma/client';

export interface FeedbackUpdateInput {
  status: FeedbackStatus;
  resolution?: FeedbackResolution | null;
}

export type FeedbackUpdateFailure =
  'RESOLUTION_REQUIRED' | 'RESOLUTION_NOT_ALLOWED';

export type FeedbackUpdateOutcome =
  | { ok: true; status: FeedbackStatus; resolution: FeedbackResolution | null }
  | { ok: false; code: FeedbackUpdateFailure };

/**
 * RESOLVED needs a resolution. Any other status carries none, so moving a
 * report back to NEW or UNDER_REVIEW clears it. Sending a resolution with a
 * status other than RESOLVED is rejected rather than silently dropped.
 */
export function resolveStatusUpdate({
  status,
  resolution,
}: FeedbackUpdateInput): FeedbackUpdateOutcome {
  if (status === 'RESOLVED') {
    return resolution
      ? { ok: true, status, resolution }
      : { ok: false, code: 'RESOLUTION_REQUIRED' };
  }

  if (resolution) return { ok: false, code: 'RESOLUTION_NOT_ALLOWED' };

  return { ok: true, status, resolution: null };
}

export interface FeedbackTargetInput {
  targetType?: FeedbackTargetType;
  targetId?: string;
  careerId?: string;
}

export interface FeedbackTarget {
  targetType: FeedbackTargetType;
  targetId: string | null;
}

/**
 * What a report points at. OTHER points at nothing, so any targetId sent with
 * it is dropped. Older clients send only a careerId, which is read as a CAREER
 * target. With neither, the report is OTHER.
 */
export function resolveFeedbackTarget({
  targetType,
  targetId,
  careerId,
}: FeedbackTargetInput): FeedbackTarget {
  if (targetType === 'OTHER') return { targetType, targetId: null };

  if (targetType) return { targetType, targetId: targetId ?? null };

  if (careerId) return { targetType: 'CAREER', targetId: careerId };

  return { targetType: 'OTHER', targetId: null };
}
