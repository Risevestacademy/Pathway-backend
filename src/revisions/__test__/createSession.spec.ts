import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import {
  CareerStatus,
  ContentType,
  RevisionStatus,
} from '../../generated/prisma/client';
import { m } from './helpers/strategy';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › createSession', () => {
  const ctx = usePublishingTestContext();

  const validCareerSnapshot = {
    career: {
      title: 'Engineer',
      slug: 'engineer',
      description: 'desc',
      fieldId: 'field-1',
    },
  };

  // ── hasStrategy gate ───────────────────────────────────────────────

  it('throws UNSUPPORTED_CONTENT_TYPE for an unregistered contextType, no DB calls', async () => {
    const { service, prismaMock, txMock } = ctx();

    const error = await service
      .createSession(
        {
          contextType: 'PATHWAY' as ContentType, // unregistered in the test suite
          contextId: null,
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'UNSUPPORTED_CONTENT_TYPE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);

    expect(prismaMock.revisionSession.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
    expect(txMock.career.create).not.toHaveBeenCalled();
  });

  // ── Pre-check: open session exists (contextId known) ───────────────

  it('returns SESSION_ALREADY_OPEN when a pre-check finds an open session, no tx opened', async () => {
    const { service, prismaMock, txMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue({
      ...sessionRow({ status: RevisionStatus.DRAFT }),
      id: 'existing-1',
    });

    const error = await service
      .createSession(
        {
          contextType: 'CAREER' as ContentType,
          contextId: 'career-1',
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'SESSION_ALREADY_OPEN',
      details: { sessionId: 'existing-1' },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);

    // Pre-check short-circuits before any tx.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
  });

  // ── contextId known: existing context root ─────────────────────────

  it('contextId known + CAREER context missing → SESSION_NOT_FOUND, no session created', async () => {
    const { service, prismaMock, txMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]); // FOR UPDATE lock result; ignored
    txMock.career.findUnique.mockResolvedValue(null);

    const error = await service
      .createSession(
        {
          contextType: 'CAREER' as ContentType,
          contextId: 'missing-career',
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.career.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
  });

  it('contextId known + CAREER exists + no in-tx open session → creates session (createdCareer:false)', async () => {
    const { service, prismaMock, txMock, analyticsMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]);
    txMock.career.findUnique.mockResolvedValue({ id: 'career-1' });
    txMock.revisionSession.findFirst.mockResolvedValue(null); // in-tx check
    const created = {
      ...sessionRow({
        status: RevisionStatus.DRAFT,
        createdCareer: false,
        contextId: 'career-1',
      }),
      revisions: [],
    };
    txMock.revisionSession.create.mockImplementation(async (args) => ({
      id: 'session-1',
      contextType: args.data.contextType,
      contextId: args.data.contextId,
      status: RevisionStatus.DRAFT,
      createdById: args.data.createdById,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      submittedAt: null,
      publishedAt: null,
      createdCareer: args.data.createdCareer,
      revisions: [],
    }));

    const result = await service.createSession(
      {
        contextType: 'CAREER' as ContentType,
        contextId: 'career-1',
      } as never,
      'user-1',
    );

    expect(txMock.career.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).toHaveBeenCalledWith({
      data: {
        contextType: 'CAREER',
        contextId: 'career-1',
        createdById: 'user-1',
        createdCareer: false,
      },
      select: expect.anything(),
    });
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_created',
      'user-1',
      {
        sessionId: 'session-1',
        contextType: 'CAREER',
        contextId: 'career-1',
      },
    );
    expect(result).toMatchObject({
      id: 'session-1',
      status: RevisionStatus.DRAFT,
    });
  });

  it('contextId known + in-tx open session appears after lock → SESSION_ALREADY_OPEN, no create', async () => {
    const { service, prismaMock, txMock, analyticsMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null); // pre-check: none
    txMock.$queryRaw.mockResolvedValueOnce([]);
    txMock.career.findUnique.mockResolvedValue({ id: 'career-1' });
    txMock.revisionSession.findFirst.mockResolvedValue({ id: 'race-winner' });

    const error = await service
      .createSession(
        {
          contextType: 'CAREER' as ContentType,
          contextId: 'career-1',
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'SESSION_ALREADY_OPEN',
      details: { sessionId: 'race-winner' },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  // ── contextId null: new context root ──────────────────────────────

  it('contextId:null + non-CAREER → UNSUPPORTED_CONTENT_TYPE, no career.create', async () => {
    const { service, prismaMock, txMock } = ctx();
    // Pre-check skipped because contextId is null; but hasStrategy must pass,
    // so use a type that IS registered but isn't CAREER.
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]);

    const error = await service
      .createSession(
        {
          contextType: 'RESOURCE' as ContentType, // registered, but not CAREER
          contextId: null,
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'UNSUPPORTED_CONTENT_TYPE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(txMock.career.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
    // contextId is null → no pre-check on prismaMock.
    expect(prismaMock.revisionSession.findFirst).not.toHaveBeenCalled();
  });

  it('contextId:null + CAREER + missing initialSnapshot → VALIDATION_FAILED, no career.create', async () => {
    const { service, prismaMock, txMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]);

    const error = await service
      .createSession(
        {
          contextType: 'CAREER' as ContentType,
          contextId: null,
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(txMock.career.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
  });

  it('contextId:null + CAREER + invalid initialSnapshot → VALIDATION_FAILED with problems, no career.create', async () => {
    const { service, prismaMock, txMock, fakeCareerStrategy } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]);
    m(fakeCareerStrategy.validate).mockReturnValue(['MISSING_TITLE']);

    const error = await service
      .createSession(
        {
          contextType: 'CAREER' as ContentType,
          contextId: null,
          initialSnapshot: { career: {} },
        } as never,
        'user-1',
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { problems: ['MISSING_TITLE'] },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(txMock.career.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.create).not.toHaveBeenCalled();
  });

  it('contextId:null + valid snapshot → career.create(DRAFT, version 1) + session.create(createdCareer:true) + analytics', async () => {
    const { service, prismaMock, txMock, analyticsMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);
    txMock.$queryRaw.mockResolvedValueOnce([]);
    txMock.career.create.mockResolvedValue({});
    txMock.revisionSession.findFirst.mockResolvedValue(null); // in-tx open check

    // Echo the create args back as the row, so analytics sees the real
    // generated contextId (not a hardcoded placeholder).
    txMock.revisionSession.create.mockImplementation(async (args) => ({
      id: 'session-1',
      contextType: args.data.contextType,
      contextId: args.data.contextId,
      status: RevisionStatus.DRAFT,
      createdById: args.data.createdById,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      submittedAt: null,
      publishedAt: null,
      createdCareer: args.data.createdCareer,
      revisions: [],
    }));

    const result = await service.createSession(
      {
        contextType: 'CAREER' as ContentType,
        contextId: null,
        initialSnapshot: validCareerSnapshot,
      } as never,
      'user-1',
    );

    // Career is created DRAFT, version 1, with the snapshot's required fields.
    const careerCreateArgs = txMock.career.create.mock.calls[0][0] as {
      data: {
        id: string;
        status: CareerStatus;
        version: number;
        title: string;
        slug: string;
        description: string;
        fieldId: string;
      };
    };
    expect(careerCreateArgs.data).toMatchObject({
      status: CareerStatus.DRAFT,
      version: 1,
      title: 'Engineer',
      slug: 'engineer',
      description: 'desc',
      fieldId: 'field-1',
    });
    // A UUID was generated.
    expect(typeof careerCreateArgs.data.id).toBe('string');
    expect(careerCreateArgs.data.id).toMatch(/^[0-9a-f-]{36}$/i);
    const generatedContextId = careerCreateArgs.data.id;

    // Session is created against the generated id, with createdCareer:true.
    expect(txMock.revisionSession.create).toHaveBeenCalledWith({
      data: {
        contextType: 'CAREER',
        contextId: generatedContextId,
        createdById: 'user-1',
        createdCareer: true,
      },
      select: expect.anything(),
    });

    // Analytics carries the generated id.
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_created',
      'user-1',
      {
        sessionId: 'session-1',
        contextType: 'CAREER',
        contextId: generatedContextId,
      },
    );

    expect(result).toMatchObject({
      id: 'session-1',
      status: RevisionStatus.DRAFT,
    });
  });
});
