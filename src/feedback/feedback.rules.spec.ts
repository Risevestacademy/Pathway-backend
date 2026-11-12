import type {
  FeedbackResolution,
  FeedbackStatus,
} from '../generated/prisma/client';
import { resolveFeedbackTarget, resolveStatusUpdate } from './feedback.rules';

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

describe('resolveFeedbackTarget', () => {
  it('keeps an explicit target', () => {
    expect(
      resolveFeedbackTarget({ targetType: 'PATHWAY_STEP', targetId: 'step-1' }),
    ).toEqual({ targetType: 'PATHWAY_STEP', targetId: 'step-1' });
  });

  it('prefers the explicit target over a careerId', () => {
    expect(
      resolveFeedbackTarget({
        targetType: 'RESOURCE',
        targetId: 'resource-1',
        careerId: 'career-1',
      }),
    ).toEqual({ targetType: 'RESOURCE', targetId: 'resource-1' });
  });

  it('drops the targetId for OTHER', () => {
    expect(
      resolveFeedbackTarget({ targetType: 'OTHER', targetId: 'anything' }),
    ).toEqual({ targetType: 'OTHER', targetId: null });
  });

  it('leaves the targetId empty when a type that needs one has none', () => {
    expect(resolveFeedbackTarget({ targetType: 'CAREER' })).toEqual({
      targetType: 'CAREER',
      targetId: null,
    });
  });

  it('reads a careerId on its own as a CAREER target', () => {
    expect(resolveFeedbackTarget({ careerId: 'career-1' })).toEqual({
      targetType: 'CAREER',
      targetId: 'career-1',
    });
  });

  it('reads no target at all as OTHER', () => {
    expect(resolveFeedbackTarget({})).toEqual({
      targetType: 'OTHER',
      targetId: null,
    });
  });
});
