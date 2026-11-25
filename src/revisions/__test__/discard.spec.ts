import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import { CareerStatus, RevisionStatus } from '../../generated/prisma/client';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › discard', () => {
  const ctx = usePublishingTestContext();

  const draftSession = sessionRow({
    status: RevisionStatus.DRAFT,
    createdById: 'user-1',
    createdCareer: false,
    contextId: 'career-1',
  });

  const lockTo = (
    txMock: ReturnType<typeof ctx>['txMock'],
    row: ReturnType<typeof sessionRow> | null,
  ) => {
    txMock.$queryRaw.mockResolvedValueOnce(row ? [row] : []);
  };

  it('DRAFT + creator + createdCareer:false → deletes the session, no career query', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    txMock.revisionSession.delete.mockResolvedValue({});

    const result = await service.discard('session-1', 'user-1');

    expect(txMock.revisionSession.delete).toHaveBeenCalledWith({
      where: { id: 'session-1' },
    });
    // No career work when the session didn't create one.
    expect(txMock.career.findUnique).not.toHaveBeenCalled();
    expect(txMock.career.delete).not.toHaveBeenCalled();
    // No analytics on discard.
    expect(analyticsMock.capture).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Draft discarded' });
  });

  it('createdCareer:true + career still DRAFT → career.delete is called', async () => {
    const { service, txMock } = ctx();
    lockTo(
      txMock,
      sessionRow({
        status: RevisionStatus.DRAFT,
        createdById: 'user-1',
        createdCareer: true,
        contextId: 'career-1',
      }),
    );
    txMock.revisionSession.delete.mockResolvedValue({});
    txMock.career.findUnique.mockResolvedValue({
      id: 'career-1',
      status: CareerStatus.DRAFT,
    });
    txMock.career.delete.mockResolvedValue({});

    const result = await service.discard('session-1', 'user-1');

    expect(txMock.career.findUnique).toHaveBeenCalledWith({
      where: { id: 'career-1' },
      select: { id: true, status: true },
    });
    expect(txMock.career.delete).toHaveBeenCalledWith({
      where: { id: 'career-1' },
    });
    expect(result).toEqual({ message: 'Draft discarded' });
  });

  it('createdCareer:true + career already PUBLISHED (promoted out-of-band) → career.delete NOT called', async () => {
    const { service, txMock } = ctx();
    lockTo(
      txMock,
      sessionRow({
        status: RevisionStatus.DRAFT,
        createdById: 'user-1',
        createdCareer: true,
        contextId: 'career-1',
      }),
    );
    txMock.revisionSession.delete.mockResolvedValue({});
    txMock.career.findUnique.mockResolvedValue({
      id: 'career-1',
      status: CareerStatus.PUBLISHED,
    });

    const result = await service.discard('session-1', 'user-1');

    expect(txMock.career.findUnique).toHaveBeenCalledTimes(1);
    expect(txMock.career.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Draft discarded' });
  });

  it('createdCareer:true + career row already gone → no career.delete, still succeeds', async () => {
    const { service, txMock } = ctx();
    lockTo(
      txMock,
      sessionRow({
        status: RevisionStatus.DRAFT,
        createdById: 'user-1',
        createdCareer: true,
        contextId: 'career-1',
      }),
    );
    txMock.revisionSession.delete.mockResolvedValue({});
    txMock.career.findUnique.mockResolvedValue(null);

    const result = await service.discard('session-1', 'user-1');

    expect(txMock.career.findUnique).toHaveBeenCalledTimes(1);
    expect(txMock.career.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Draft discarded' });
  });

  it('returns INVALID_SESSION_STATE for a non-DRAFT session, no deletes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.IN_REVIEW }));

    const error = await service
      .discard('session-1', 'user-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.revisionSession.delete).not.toHaveBeenCalled();
    expect(txMock.career.findUnique).not.toHaveBeenCalled();
    expect(txMock.career.delete).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns NOT_SESSION_CREATOR with the discard-specific message for a non-creator, no deletes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);

    const error = await service
      .discard('session-1', 'someone-else')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'NOT_SESSION_CREATOR',
      // Discard intercepts and throws its own message, not the generic one.
      message: 'Only the session creator can discard it',
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(txMock.revisionSession.delete).not.toHaveBeenCalled();
    expect(txMock.career.findUnique).not.toHaveBeenCalled();
    expect(txMock.career.delete).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns SESSION_NOT_FOUND when the session row is absent, no deletes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, null);

    const error = await service
      .discard('session-1', 'user-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.revisionSession.delete).not.toHaveBeenCalled();
    expect(txMock.career.findUnique).not.toHaveBeenCalled();
    expect(txMock.career.delete).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });
});
