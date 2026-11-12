import type {
  FeedbackResolution,
  FeedbackStatus,
} from '../generated/prisma/client';
import { resolveStatusUpdate } from './feedback.rules';

describe('resolveStatusUpdate', () => {
  it.each<[FeedbackResolution]>([['FIXED'], ['NOT_AN_ISSUE']])(
    'resolves with %s',
    (resolution) => {
      expect(resolveStatusUpdate({ status: 'RESOLVED', resolution })).toEqual({
        ok: true,
        status: 'RESOLVED',
        resolution,
      });
    },
  );

  it.each<[string, FeedbackResolution | null | undefined]>([
    ['no resolution', undefined],
    ['a null resolution', null],
  ])('rejects RESOLVED with %s', (_label, resolution) => {
    expect(resolveStatusUpdate({ status: 'RESOLVED', resolution })).toEqual({
      ok: false,
      code: 'RESOLUTION_REQUIRED',
    });
  });

  it.each<[FeedbackStatus]>([['NEW'], ['UNDER_REVIEW']])(
    'reopening to %s clears the resolution',
    (status) => {
      expect(resolveStatusUpdate({ status })).toEqual({
        ok: true,
        status,
        resolution: null,
      });
      expect(resolveStatusUpdate({ status, resolution: null })).toEqual({
        ok: true,
        status,
        resolution: null,
      });
    },
  );

  it.each<[FeedbackStatus]>([['NEW'], ['UNDER_REVIEW']])(
    'rejects a resolution sent with %s',
    (status) => {
      expect(resolveStatusUpdate({ status, resolution: 'FIXED' })).toEqual({
        ok: false,
        code: 'RESOLUTION_NOT_ALLOWED',
      });
    },
  );
});
