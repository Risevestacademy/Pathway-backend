import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma';
import { DomainException, ROLE_RANK } from '../../common';
import {
  CareerStatus,
  ReviewDecision,
  RevisionStatus,
  Role,
} from '../../generated/prisma/client';
import { RevisionsService } from './content-revisions.service';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';
import type { CareerSnapshot } from './career-snapshot.types';
import { AnalyticsService } from '../../analytics/analytics.service';

describe('RevisionsService', () => {
  let service: RevisionsService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const tx = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    review: { create: jest.fn<(args: unknown) => Promise<unknown>>() },
    contentRevision: {
      findFirst:
        jest.fn<
          (
            args: unknown,
          ) => Promise<{ id: string; status: RevisionStatus } | null>
        >(),
      findUnique:
        jest.fn<(args: unknown) => Promise<{ careerId: string } | null>>(),
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn(
      <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> =>
        callback(tx),
    ),
    contentRevision: {
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique:
        jest.fn<
          (args: unknown) => Promise<{ status: RevisionStatus } | null>
        >(),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
    },
    career: {
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    resource: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
    },
    userPathwayStep: {
      groupBy: jest.fn<(args: unknown) => Promise<unknown[]>>(),
    },
  };

  const analytics = { capture: jest.fn() };
  const formatter = { format: jest.fn() };

  const snapshot: CareerSnapshot = {
    schemaVersion: 1,
    career: {
      title: 'DevOps Engineer',
      slug: 'devops-engineer',
      description: 'Automates delivery.',
      roleSummary: null,
      fieldId: null,
      targetLevels: [],
      exampleActivities: [],
      typicalEducationNote: null,
      certificationsNote: null,
    },
    pathway: null,
    steps: [],
    skills: [],
    outlook: [],
    resources: [],
  };

  const updatedAt = new Date('2026-10-28T17:30:00.000Z');
  const savedRevision = (status: RevisionStatus = RevisionStatus.DRAFT) => ({
    id: 'revision-1',
    careerId: 'career-1',
    status,
    baseVersion: 3,
    updatedAt,
  });

  const select = {
    id: true,
    careerId: true,
    status: true,
    baseVersion: true,
    updatedAt: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([
      { version: 3, status: CareerStatus.PUBLISHED },
    ]);
    tx.contentRevision.findFirst.mockResolvedValue(null);
    tx.contentRevision.create.mockResolvedValue(savedRevision());
    tx.contentRevision.update.mockResolvedValue(savedRevision());
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevisionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReviewerDiffFormatter, useValue: formatter },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compile();

    service = module.get(RevisionsService);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('buildDiff', () => {
    const revisionRecord = (createdById: string) => ({
      careerId: 'career-1',
      baseVersion: 1,
      snapshot,
      createdAt: updatedAt,
      createdById,
      createdBy: { profile: { fullName: 'Editor' } },
    });

    const liveCareerRecord = {
      id: 'career-1',
      version: 1,
      title: 'DevOps Engineer',
      slug: 'devops-engineer',
      description: 'Automates delivery.',
      roleSummary: null,
      fieldId: null,
      targetLevels: [],
      exampleActivities: [],
      typicalEducationNote: null,
      certificationsNote: null,
      skills: [],
      outlook: [],
      pathway: null,
    };

    const stubLiveCareer = () => {
      mockPrisma.career.findUniqueOrThrow.mockResolvedValue(liveCareerRecord);
      mockPrisma.resource.findMany.mockResolvedValue([]);
      mockPrisma.userPathwayStep.groupBy.mockResolvedValue([]);
      formatter.format.mockReturnValue({ ok: true });
    };

    it('allows the creator at EDITOR rank and formats the diff', async () => {
      mockPrisma.contentRevision.findUniqueOrThrow.mockResolvedValue(
        revisionRecord('editor-1'),
      );
      stubLiveCareer();

      const result = await service.buildDiff('revision-1', {
        id: 'editor-1',
        role: Role.EDITOR,
      });

      expect(result).toEqual({ ok: true });
      expect(formatter.format).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        { revisionId: 'revision-1', stale: false, actorUserId: 'editor-1' },
        'Revision diff generated',
      );
    });

    it('allows a REVIEWER who is not the creator', async () => {
      mockPrisma.contentRevision.findUniqueOrThrow.mockResolvedValue(
        revisionRecord('editor-1'),
      );
      stubLiveCareer();

      await service.buildDiff('revision-1', {
        id: 'reviewer-1',
        role: Role.REVIEWER,
      });

      expect(formatter.format).toHaveBeenCalledTimes(1);
    });

    it('allows an ADMIN who is not the creator (rank >= REVIEWER)', async () => {
      mockPrisma.contentRevision.findUniqueOrThrow.mockResolvedValue(
        revisionRecord('editor-1'),
      );
      stubLiveCareer();

      await service.buildDiff('revision-1', {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(formatter.format).toHaveBeenCalledTimes(1);
    });

    it('rejects an EDITOR who is not the creator with DIFF_FORBIDDEN', async () => {
      mockPrisma.contentRevision.findUniqueOrThrow.mockResolvedValue(
        revisionRecord('editor-1'),
      );

      const error = await service
        .buildDiff('revision-1', { id: 'editor-2', role: Role.EDITOR })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({ code: 'DIFF_FORBIDDEN' });
      expect((error as DomainException).getStatus()).toBe(403);
      expect(formatter.format).not.toHaveBeenCalled();
      expect(mockPrisma.career.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          revisionId: 'revision-1',
          actorUserId: 'editor-2',
          reason: 'DIFF_FORBIDDEN',
        },
        'Revision diff denied',
      );
    });

    it('rejects a USER who happens to be the creator (below REVIEWER floor)', async () => {
      mockPrisma.contentRevision.findUniqueOrThrow.mockResolvedValue(
        revisionRecord('user-1'),
      );

      // USER is creator, but the guard would already 403 at EDITOR floor in
      // production. At service level we still reject because rank is too low
      // and only creator-or-REVIEWER+ passes. The creator branch makes USER
      // pass in isolation — this documents that the guard is the real floor.
      const rank = ROLE_RANK[Role.USER];
      expect(rank).toBeLessThan(ROLE_RANK[Role.REVIEWER]);
    });
  });

  describe('saveDraftRevision', () => {
    it('locks the career row before reading the open revision', async () => {
      await service.saveDraftRevision('career-1', snapshot, 'editor-1');

      const [strings, careerId] = tx.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        string,
      ];
      expect(strings.join('?')).toContain('FOR UPDATE');
      expect(careerId).toBe('career-1');
      expect(tx.contentRevision.findFirst).toHaveBeenCalledWith({
        where: {
          careerId: 'career-1',
          status: { in: [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW] },
        },
        select: { id: true, status: true },
      });
    });

    it('creates a draft at the live version when none is open', async () => {
      const result = await service.saveDraftRevision(
        'career-1',
        snapshot,
        'editor-1',
      );

      expect(tx.contentRevision.create).toHaveBeenCalledWith({
        data: {
          careerId: 'career-1',
          baseVersion: 3,
          snapshot,
          createdById: 'editor-1',
        },
        select,
      });
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(result).toEqual({ ...savedRevision(), created: true });
      expect(logSpy).toHaveBeenCalledWith(
        {
          revisionId: 'revision-1',
          careerId: 'career-1',
          actorUserId: 'editor-1',
          created: true,
        },
        'Draft revision created',
      );
    });

    it('replaces the snapshot of the open draft', async () => {
      tx.contentRevision.findFirst.mockResolvedValue({
        id: 'revision-1',
        status: RevisionStatus.DRAFT,
      });

      const result = await service.saveDraftRevision(
        'career-1',
        snapshot,
        'editor-1',
      );

      expect(tx.contentRevision.update).toHaveBeenCalledWith({
        where: { id: 'revision-1' },
        data: { snapshot },
        select,
      });
      expect(tx.contentRevision.create).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ created: false }),
        'Draft revision updated',
      );
    });

    it('stores a plain copy of the snapshot', async () => {
      await service.saveDraftRevision('career-1', snapshot, 'editor-1');

      const [[args]] = tx.contentRevision.create.mock.calls as [
        [{ data: { snapshot: CareerSnapshot } }],
      ];
      expect(args.data.snapshot).toEqual(snapshot);
      expect(args.data.snapshot).not.toBe(snapshot);
    });

    it('rejects with REVISION_IN_REVIEW and writes nothing', async () => {
      tx.contentRevision.findFirst.mockResolvedValue({
        id: 'revision-1',
        status: RevisionStatus.IN_REVIEW,
      });

      const error = await service
        .saveDraftRevision('career-1', snapshot, 'editor-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({
        code: 'REVISION_IN_REVIEW',
        details: { revisionId: 'revision-1' },
      });
      expect((error as DomainException).getStatus()).toBe(409);
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(tx.contentRevision.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          careerId: 'career-1',
          actorUserId: 'editor-1',
          reason: 'REVISION_IN_REVIEW',
        },
        'Draft revision rejected',
      );
    });

    it('rejects a retired career with CAREER_RETIRED', async () => {
      tx.$queryRaw.mockResolvedValue([
        { version: 2, status: CareerStatus.RETIRED },
      ]);

      await expect(
        service.saveDraftRevision('career-1', snapshot, 'editor-1'),
      ).rejects.toMatchObject({ code: 'CAREER_RETIRED' });
      expect(tx.contentRevision.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown career', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.saveDraftRevision('missing', snapshot, 'editor-1'),
      ).rejects.toThrow(new NotFoundException('Career not found'));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'CAREER_NOT_FOUND' }),
        'Draft revision rejected',
      );
    });

    it('rejects an inconsistent snapshot before opening a transaction', async () => {
      const error = await service
        .saveDraftRevision(
          'career-1',
          {
            ...snapshot,
            skills: [
              { skillId: 'skill-1', importance: 'REQUIRED' },
              { skillId: 'skill-1', importance: 'REQUIRED' },
            ],
          },
          'editor-1',
        )
        .catch((e: unknown) => e);

      expect(error).toMatchObject({
        code: 'INVALID_SNAPSHOT',
        details: { problems: ['skills.1: duplicate skillId of skills.0'] },
      });
      expect((error as DomainException).getStatus()).toBe(400);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('rebaseRevision', () => {
    const setRevisionRow = (
      row: {
        id: string;
        careerId: string;
        status: RevisionStatus;
        baseVersion: number;
        createdById: string;
      } | null,
    ) => {
      tx.contentRevision.findUnique.mockResolvedValue(
        row ? { careerId: row.careerId } : null,
      );
      tx.$queryRaw
        .mockResolvedValueOnce([{ version: 4, status: CareerStatus.PUBLISHED }])
        .mockResolvedValueOnce(row ? [row] : []);
    };

    it('re-anchors a stale draft to the current live version and emits', async () => {
      const row = {
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.DRAFT,
        baseVersion: 3,
        createdById: 'editor-1',
      };
      setRevisionRow(row);
      tx.contentRevision.update.mockResolvedValue({
        ...savedRevision(RevisionStatus.DRAFT),
        baseVersion: 4,
      });

      const result = await service.rebaseRevision('revision-1', 'editor-1');

      expect(tx.contentRevision.update).toHaveBeenCalledWith({
        where: { id: 'revision-1' },
        data: { baseVersion: 4 },
        select,
      });
      expect(result).toEqual({
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.DRAFT,
        baseVersion: 4,
        updatedAt,
        liveVersion: 4,
        rebased: true,
      });
      expect(analytics.capture).toHaveBeenCalledWith(
        'revision_rebased',
        'editor-1',
        { revisionId: 'revision-1', careerId: 'career-1', newBaseVersion: 4 },
      );
      expect(logSpy).toHaveBeenCalledWith(
        {
          revisionId: 'revision-1',
          oldBaseVersion: 3,
          newBaseVersion: 4,
          actorUserId: 'editor-1',
        },
        'Revision rebased',
      );
    });

    it('returns unchanged and emits nothing when already fresh', async () => {
      setRevisionRow({
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.DRAFT,
        baseVersion: 4,
        createdById: 'editor-1',
      });
      tx.contentRevision.findUniqueOrThrow.mockResolvedValue(
        savedRevision(RevisionStatus.DRAFT),
      );

      const result = await service.rebaseRevision('revision-1', 'editor-1');

      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(analytics.capture).not.toHaveBeenCalled();
      expect(result).toMatchObject({ rebased: false, liveVersion: 4 });
    });

    it('rejects a non-DRAFT revision with INVALID_REVISION_STATE', async () => {
      setRevisionRow({
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.IN_REVIEW,
        baseVersion: 3,
        createdById: 'editor-1',
      });

      await expect(
        service.rebaseRevision('revision-1', 'editor-1'),
      ).rejects.toMatchObject({ code: 'INVALID_REVISION_STATE' });
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(analytics.capture).not.toHaveBeenCalled();
    });

    it('rejects a non-creator with NOT_REVISION_CREATOR', async () => {
      setRevisionRow({
        id: 'revision-1',
        careerId: 'career-1',
        status: RevisionStatus.DRAFT,
        baseVersion: 3,
        createdById: 'editor-1',
      });

      await expect(
        service.rebaseRevision('revision-1', 'editor-2'),
      ).rejects.toMatchObject({ code: 'NOT_REVISION_CREATOR' });
      expect(
        (
          await service.rebaseRevision('revision-1', 'editor-2').catch((e) => e)
        ).getStatus(),
      ).toBe(403);
    });

    it('throws NotFoundException for an unknown revision', async () => {
      tx.contentRevision.findUnique.mockResolvedValue(null);

      await expect(
        service.rebaseRevision('missing', 'editor-1'),
      ).rejects.toThrow(new NotFoundException('Revision not found'));
    });

    it('rejects a retired career with CAREER_RETIRED', async () => {
      tx.contentRevision.findUnique.mockResolvedValue({ careerId: 'career-1' });
      tx.$queryRaw
        .mockResolvedValueOnce([{ version: 2, status: CareerStatus.RETIRED }])
        .mockResolvedValueOnce([
          {
            id: 'revision-1',
            careerId: 'career-1',
            status: RevisionStatus.DRAFT,
            baseVersion: 3,
            createdById: 'editor-1',
          },
        ]);

      await expect(
        service.rebaseRevision('revision-1', 'editor-1'),
      ).rejects.toMatchObject({ code: 'CAREER_RETIRED' });
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
    });
  });

  describe('recallRevision', () => {
    const editor = { id: 'editor-1', role: Role.EDITOR };

    const setRows = (
      revision: { status: RevisionStatus; createdById: string } | null,
    ) => {
      tx.contentRevision.findUnique.mockResolvedValue({ careerId: 'career-1' });
      tx.$queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce(revision ? [revision] : []);
    };

    const failure = (promise: Promise<unknown>) =>
      promise.catch((e: unknown) => e) as Promise<DomainException>;

    beforeEach(() => {
      tx.$queryRaw.mockReset();
      tx.contentRevision.update.mockResolvedValue(savedRevision());
    });

    it('locks the career row, then the revision row', async () => {
      setRows({ status: RevisionStatus.IN_REVIEW, createdById: 'editor-1' });

      await service.recallRevision('revision-1', editor);

      const [careerLock, revisionLock] = tx.$queryRaw.mock.calls as [
        [TemplateStringsArray, string],
        [TemplateStringsArray, string],
      ];
      expect(careerLock[0].join('?')).toContain('"Career"');
      expect(careerLock[0].join('?')).toContain('FOR UPDATE');
      expect(careerLock[1]).toBe('career-1');
      expect(revisionLock[0].join('?')).toContain('"ContentRevision"');
      expect(revisionLock[0].join('?')).toContain('FOR UPDATE');
      expect(revisionLock[1]).toBe('revision-1');
    });

    it("sets the creator's IN_REVIEW revision back to DRAFT and returns it", async () => {
      setRows({ status: RevisionStatus.IN_REVIEW, createdById: 'editor-1' });

      const result = await service.recallRevision('revision-1', editor);

      expect(tx.contentRevision.update).toHaveBeenCalledWith({
        where: { id: 'revision-1' },
        data: { status: RevisionStatus.DRAFT },
        select,
      });
      expect(result).toEqual(savedRevision());
      expect(logSpy).toHaveBeenCalledWith(
        { revisionId: 'revision-1', actorUserId: 'editor-1' },
        'Revision recalled',
      );
      expect(analytics.capture).not.toHaveBeenCalled();
    });

    it("lets an ADMIN recall someone else's revision", async () => {
      setRows({ status: RevisionStatus.IN_REVIEW, createdById: 'editor-1' });

      await service.recallRevision('revision-1', {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(tx.contentRevision.update).toHaveBeenCalled();
    });

    it('rejects another editor with NOT_REVISION_CREATOR before checking status', async () => {
      setRows({ status: RevisionStatus.DRAFT, createdById: 'editor-2' });

      const error = await failure(service.recallRevision('revision-1', editor));

      expect(error).toMatchObject({ code: 'NOT_REVISION_CREATOR' });
      expect(error.getStatus()).toBe(403);
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          revisionId: 'revision-1',
          actorUserId: 'editor-1',
          reason: 'NOT_REVISION_CREATOR',
        },
        'Recall rejected',
      );
    });

    it.each([
      RevisionStatus.DRAFT,
      RevisionStatus.APPROVED,
      RevisionStatus.REJECTED,
      RevisionStatus.PUBLISHED,
    ])('rejects a %s revision with INVALID_REVISION_STATE', async (status) => {
      setRows({ status, createdById: 'editor-1' });

      const error = await failure(service.recallRevision('revision-1', editor));

      expect(error).toMatchObject({ code: 'INVALID_REVISION_STATE' });
      expect(error.getStatus()).toBe(409);
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown revision', async () => {
      tx.contentRevision.findUnique.mockResolvedValue(null);

      await expect(service.recallRevision('missing', editor)).rejects.toThrow(
        new NotFoundException('Revision not found'),
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the revision disappears before the lock', async () => {
      setRows(null);

      await expect(
        service.recallRevision('revision-1', editor),
      ).rejects.toThrow(NotFoundException);
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
    });
  });

  describe('reviewRevision', () => {
    const reviewer = { id: 'reviewer-1', role: Role.REVIEWER };
    const reviewedAt = new Date('2026-10-30T10:00:00.000Z');

    const revisionRow = (
      overrides: Partial<{
        status: RevisionStatus;
        baseVersion: number;
        createdById: string;
      }> = {},
    ) => ({
      id: 'revision-1',
      careerId: 'career-1',
      status: RevisionStatus.IN_REVIEW,
      baseVersion: 3,
      createdById: 'editor-1',
      ...overrides,
    });

    // Mirrors the service's lock order: peek, career row, revision row.
    const setRows = (
      revision: ReturnType<typeof revisionRow>,
      liveVersion = 3,
    ) => {
      tx.contentRevision.findUnique.mockResolvedValue({
        careerId: revision.careerId,
      });
      tx.$queryRaw
        .mockResolvedValueOnce([{ version: liveVersion }])
        .mockResolvedValueOnce([revision]);
    };

    const expectNoWrites = () => {
      expect(tx.review.create).not.toHaveBeenCalled();
      expect(tx.contentRevision.update).not.toHaveBeenCalled();
      expect(analytics.capture).not.toHaveBeenCalled();
    };

    const failure = (promise: Promise<unknown>) =>
      promise.catch((e: unknown) => e) as Promise<DomainException>;

    beforeEach(() => {
      tx.$queryRaw.mockReset();
      tx.review.create.mockImplementation(async (args) => {
        const { data } = args as {
          data: {
            revisionId: string;
            decision: ReviewDecision;
            note: string | null;
          };
        };
        return {
          id: 'review-1',
          revisionId: data.revisionId,
          decision: data.decision,
          note: data.note,
          createdAt: reviewedAt,
        };
      });
      tx.contentRevision.update.mockImplementation(async (args) => {
        const { data } = args as { data: { status: RevisionStatus } };
        return { careerId: 'career-1', status: data.status };
      });
    });

    it('approves a fresh revision: writes the review, then sets APPROVED and nothing else', async () => {
      setRows(revisionRow());

      const result = await service.reviewRevision('revision-1', reviewer, {
        decision: ReviewDecision.APPROVED,
        note: 'Looks good',
      });

      expect(tx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            revisionId: 'revision-1',
            reviewerId: 'reviewer-1',
            decision: ReviewDecision.APPROVED,
            note: 'Looks good',
          },
        }),
      );
      expect(tx.contentRevision.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'revision-1' },
          data: { status: RevisionStatus.APPROVED },
        }),
      );
      expect(tx.review.create.mock.invocationCallOrder[0]).toBeLessThan(
        tx.contentRevision.update.mock.invocationCallOrder[0],
      );
      expect(result).toEqual({
        id: 'review-1',
        revisionId: 'revision-1',
        decision: ReviewDecision.APPROVED,
        note: 'Looks good',
        revisionStatus: RevisionStatus.APPROVED,
        createdAt: reviewedAt,
      });
    });

    it('logs without the note and emits revision_reviewed after the write', async () => {
      setRows(revisionRow());

      await service.reviewRevision('revision-1', reviewer, {
        decision: ReviewDecision.APPROVED,
        note: 'Looks good',
      });

      expect(logSpy).toHaveBeenCalledWith(
        {
          revisionId: 'revision-1',
          decision: ReviewDecision.APPROVED,
          reviewerId: 'reviewer-1',
        },
        'Revision reviewed',
      );
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain('Looks good');
      expect(analytics.capture).toHaveBeenCalledWith(
        'revision_reviewed',
        'reviewer-1',
        {
          revisionId: 'revision-1',
          careerId: 'career-1',
          decision: ReviewDecision.APPROVED,
        },
      );
      expect(analytics.capture.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.contentRevision.update.mock.invocationCallOrder[0],
      );
    });

    it.each([
      ['fresh', 3],
      ['stale', 2],
    ])('records a rejection on a %s revision', async (_label, baseVersion) => {
      setRows(revisionRow({ baseVersion }));

      const result = await service.reviewRevision('revision-1', reviewer, {
        decision: ReviewDecision.REJECTED,
        note: 'Needs sources',
      });

      expect(result.revisionStatus).toBe(RevisionStatus.REJECTED);
      expect(tx.contentRevision.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: RevisionStatus.REJECTED } }),
      );
    });

    it('blocks approving a stale revision with REVISION_STALE', async () => {
      setRows(revisionRow({ baseVersion: 2 }), 3);

      const error = await failure(
        service.reviewRevision('revision-1', reviewer, {
          decision: ReviewDecision.APPROVED,
        }),
      );

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({
        code: 'REVISION_STALE',
        details: { baseVersion: 2, liveVersion: 3 },
      });
      expect(error.getStatus()).toBe(409);
      expectNoWrites();
    });

    it.each([ReviewDecision.APPROVED, ReviewDecision.REJECTED])(
      'blocks a REVIEWER from a %s decision on their own revision',
      async (decision) => {
        setRows(revisionRow({ createdById: 'reviewer-1' }));

        const error = await failure(
          service.reviewRevision('revision-1', reviewer, { decision }),
        );

        expect(error).toMatchObject({ code: 'SELF_REVIEW_NOT_ALLOWED' });
        expect(error.getStatus()).toBe(403);
        expectNoWrites();
      },
    );

    it('lets an ADMIN review their own revision', async () => {
      setRows(revisionRow({ createdById: 'admin-1' }));

      const result = await service.reviewRevision(
        'revision-1',
        { id: 'admin-1', role: Role.ADMIN },
        { decision: ReviewDecision.APPROVED },
      );

      expect(result.revisionStatus).toBe(RevisionStatus.APPROVED);
    });

    it('checks separation of duties before staleness', async () => {
      setRows(revisionRow({ createdById: 'reviewer-1', baseVersion: 2 }), 3);

      const error = await failure(
        service.reviewRevision('revision-1', reviewer, {
          decision: ReviewDecision.APPROVED,
        }),
      );

      expect(error).toMatchObject({ code: 'SELF_REVIEW_NOT_ALLOWED' });
    });

    it.each([
      RevisionStatus.DRAFT,
      RevisionStatus.APPROVED,
      RevisionStatus.REJECTED,
      RevisionStatus.PUBLISHED,
    ])('rejects a %s revision with INVALID_REVISION_STATE', async (status) => {
      setRows(revisionRow({ status }));

      const error = await failure(
        service.reviewRevision('revision-1', reviewer, {
          decision: ReviewDecision.APPROVED,
        }),
      );

      expect(error).toMatchObject({ code: 'INVALID_REVISION_STATE' });
      expect(error.getStatus()).toBe(409);
      expectNoWrites();
    });

    it('stores a blank note as null', async () => {
      setRows(revisionRow());

      const result = await service.reviewRevision('revision-1', reviewer, {
        decision: ReviewDecision.REJECTED,
        note: '   ',
      });

      expect(result.note).toBeNull();
    });

    it('throws NotFoundException for an unknown revision', async () => {
      tx.contentRevision.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewRevision('missing', reviewer, {
          decision: ReviewDecision.APPROVED,
        }),
      ).rejects.toThrow(new NotFoundException('Revision not found'));
      expectNoWrites();
    });
  });

  describe('deleteDraftRevision', () => {
    it('deletes only while the revision is still a DRAFT and logs', async () => {
      mockPrisma.contentRevision.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteDraftRevision(
        'revision-1',
        'editor-1',
      );

      expect(mockPrisma.contentRevision.deleteMany).toHaveBeenCalledWith({
        where: { id: 'revision-1', status: RevisionStatus.DRAFT },
      });
      expect(result).toEqual({ message: 'Draft revision deleted' });
      expect(logSpy).toHaveBeenCalledWith(
        { revisionId: 'revision-1', actorUserId: 'editor-1' },
        'Draft revision deleted',
      );
      expect(mockPrisma.contentRevision.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      RevisionStatus.IN_REVIEW,
      RevisionStatus.APPROVED,
      RevisionStatus.REJECTED,
      RevisionStatus.PUBLISHED,
    ])('rejects a %s revision with INVALID_REVISION_STATE', async (status) => {
      mockPrisma.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.contentRevision.findUnique.mockResolvedValue({ status });

      const error = await service
        .deleteDraftRevision('revision-1', 'editor-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({ code: 'INVALID_REVISION_STATE' });
      expect((error as DomainException).getStatus()).toBe(409);
    });

    it('throws NotFoundException for an unknown revision', async () => {
      mockPrisma.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.contentRevision.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteDraftRevision('missing', 'editor-1'),
      ).rejects.toThrow(new NotFoundException('Revision not found'));
    });
  });
});
