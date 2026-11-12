import type {
  FeedbackResolution,
  FeedbackStatus,
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
