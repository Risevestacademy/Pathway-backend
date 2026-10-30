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
import { DomainException } from '../../common';
import { CareerStatus, RevisionStatus } from '../../generated/prisma/client';
import { RevisionsService } from './content-revisions.service';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';
import type { CareerSnapshot } from './career-snapshot.types';
import { AnalyticsService } from '../../analytics/analytics.service';

describe('RevisionsService', () => {
  let service: RevisionsService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const tx = {
    $queryRaw:
      jest.fn<
        (
          ...args: unknown[]
        ) => Promise<{ version: number; status: CareerStatus }[]>
      >(),
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
  };

  const analytics = { capture: jest.fn() };

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
        { provide: ReviewerDiffFormatter, useValue: {} },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compile();

    service = module.get(RevisionsService);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
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
      // The two $queryRaw calls: [0] = career lock, [1] = revision lock.
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
});
