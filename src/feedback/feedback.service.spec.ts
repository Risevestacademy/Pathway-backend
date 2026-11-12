import { jest } from '@jest/globals';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma';
import { DomainException } from '../common';
import { Prisma } from '../generated/prisma/client';
import type { FeedbackResponseDto } from './dto/feedback-response.dto';
import { buildFeedbackListWhere, FEEDBACK_LIST_SELECT } from './feedback-list';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const findFirst = () =>
    jest.fn<(args: unknown) => Promise<{ id: string } | null>>();
  const findMany = () => jest.fn<(args: unknown) => Promise<unknown[]>>();

  const mockPrismaService = {
    contentFeedback: {
      create: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    feedbackNote: {
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    career: { findFirst: findFirst(), findMany: findMany() },
    pathway: { findFirst: findFirst(), findMany: findMany() },
    pathwayStage: { findFirst: findFirst(), findMany: findMany() },
    pathwayStep: { findFirst: findFirst(), findMany: findMany() },
    pathwayStepTask: { findFirst: findFirst(), findMany: findMany() },
    resource: { findFirst: findFirst(), findMany: findMany() },
    outlookData: { findFirst: findFirst(), findMany: findMany() },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  const feedback: FeedbackResponseDto = {
    id: 'feedback-1',
    category: 'BROKEN_LINK',
    section: 'RESOURCES',
    careerId: 'career-1',
    description: 'Step 2 course link is dead.',
    userEmail: 'ada@example.com',
    platform: 'WEB',
    status: 'NEW',
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.contentFeedback.create.mockResolvedValue({
      id: 'feedback-1',
    });
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    logSpy.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('submitFeedback', () => {
    const create = () => mockPrismaService.contentFeedback.create;

    it('stores general feedback as an OTHER report and returns a confirmation without ids', async () => {
      const result = await service.submitFeedback({
        category: 'USABILITY',
        description: 'The filters are hard to find.',
        section: 'GENERAL',
      });

      expect(create()).toHaveBeenCalledWith({
        data: {
          category: 'USABILITY',
          description: 'The filters are hard to find.',
          section: 'GENERAL',
          careerId: undefined,
          userEmail: undefined,
          platform: undefined,
          targetType: 'OTHER',
          targetId: null,
        },
        select: { id: true },
      });
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Feedback received' });
    });

    it('stores every optional field, reading a careerId on its own as a CAREER target', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({ id: 'career-1' });

      await service.submitFeedback({
        category: 'BROKEN_LINK',
        description: 'Step 3 link is dead.',
        section: 'RESOURCES',
        careerId: 'career-1',
        userEmail: 'ada@example.com',
        platform: 'IOS',
      });

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: { id: 'career-1', status: 'PUBLISHED' },
        select: { id: true },
      });
      expect(create()).toHaveBeenCalledWith({
        data: {
          category: 'BROKEN_LINK',
          description: 'Step 3 link is dead.',
          section: 'RESOURCES',
          careerId: 'career-1',
          userEmail: 'ada@example.com',
          platform: 'IOS',
          targetType: 'CAREER',
          targetId: 'career-1',
        },
        select: { id: true },
      });
    });

    it('stores an explicit target and keeps the careerId as context', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue({
        id: 'step-1',
      });

      await service.submitFeedback({
        category: 'BROKEN_LINK',
        description: 'Step 3 link is dead.',
        section: 'RESOURCES',
        careerId: 'career-1',
        targetType: 'PATHWAY_STEP',
        targetId: 'step-1',
      });

      expect(create()).toHaveBeenCalledWith({
        data: expect.objectContaining({
          careerId: 'career-1',
          targetType: 'PATHWAY_STEP',
          targetId: 'step-1',
        }),
        select: { id: true },
      });
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
    });

    it('stores a certification report as CERTIFICATION', async () => {
      mockPrismaService.resource.findFirst.mockResolvedValue({
        id: 'resource-1',
      });

      await service.submitFeedback({
        category: 'INCORRECT_CONTENT',
        description: 'The cost is wrong.',
        section: 'GENERAL',
        targetType: 'CERTIFICATION',
        targetId: 'resource-1',
      });

      expect(create()).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'CERTIFICATION',
          targetId: 'resource-1',
        }),
        select: { id: true },
      });
    });

    it('needs no targetId for OTHER and drops one that is sent', async () => {
      await service.submitFeedback({
        category: 'OTHER',
        description: 'Something else.',
        section: 'GENERAL',
        targetType: 'OTHER',
        targetId: 'ignored',
      });

      expect(create()).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetType: 'OTHER', targetId: null }),
        select: { id: true },
      });
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a target that is missing or not visible with 404 and stores nothing', async () => {
      mockPrismaService.resource.findFirst.mockResolvedValue(null);

      await expect(
        service.submitFeedback({
          category: 'BROKEN_LINK',
          description: 'Dead link.',
          section: 'GENERAL',
          targetType: 'RESOURCE',
          targetId: 'missing',
        }),
      ).rejects.toThrow(new NotFoundException('Target not found'));

      expect(create()).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('logs the feedback id and target type but never the email or description', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({ id: 'career-1' });

      await service.submitFeedback({
        category: 'INCORRECT_CONTENT',
        description: 'Salary looks wrong.',
        section: 'OUTLOOK',
        careerId: 'career-1',
        userEmail: 'ada@example.com',
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        { feedbackId: 'feedback-1', targetType: 'CAREER' },
        'Feedback submitted',
      );
      const logged = JSON.stringify([logSpy.mock.calls, warnSpy.mock.calls]);
      expect(logged).not.toContain('ada@example.com');
      expect(logged).not.toContain('Salary looks wrong.');
    });

    it('throws BadRequestException and warns with the careerId when the context career does not exist', async () => {
      create().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint violated',
          { code: 'P2003', clientVersion: 'test' },
        ),
      );

      await expect(
        service.submitFeedback({
          category: 'INCORRECT_CONTENT',
          description: 'Salary looks wrong.',
          section: 'OUTLOOK',
          careerId: 'missing-career',
          targetType: 'OTHER',
        }),
      ).rejects.toThrow(new BadRequestException('Career not found'));
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        { careerId: 'missing-career', reason: 'CAREER_NOT_FOUND' },
        'Feedback rejected',
      );
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      create().mockRejectedValue(failure);

      await expect(
        service.submitFeedback({
          category: 'OTHER',
          description: 'x',
          section: 'GENERAL',
        }),
      ).rejects.toBe(failure);
    });
  });

  describe('getFeedback', () => {
    const createdAt = new Date('2026-11-12T10:00:00.000Z');
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'feedback-1',
      category: 'BROKEN_LINK',
      section: 'RESOURCES',
      status: 'NEW',
      resolution: null,
      description: 'Step 2 course link is dead.',
      userEmail: 'ada@example.com',
      platform: 'WEB',
      targetType: 'CAREER',
      targetId: 'career-1',
      createdAt,
      ...overrides,
    });

    beforeEach(() => {
      mockPrismaService.contentFeedback.findMany.mockResolvedValue([row()]);
      mockPrismaService.contentFeedback.count.mockResolvedValue(41);
      mockPrismaService.career.findMany.mockResolvedValue([
        { id: 'career-1', title: 'Software Engineer' },
      ]);
    });

    it('returns the requested page newest first with the total count', async () => {
      const query = { page: 3, limit: 20 };

      const result = await service.getFeedback(query);

      expect(mockPrismaService.contentFeedback.findMany).toHaveBeenCalledWith({
        where: buildFeedbackListWhere({}),
        select: FEEDBACK_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 40,
        take: 20,
      });
      expect(mockPrismaService.contentFeedback.count).toHaveBeenCalledWith({
        where: buildFeedbackListWhere({}),
      });
      expect(result).toMatchObject({ total: 41, page: 3, limit: 20 });
      expect(result.items).toHaveLength(1);
    });

    it('filters the page and the count by status, category, target type and career', async () => {
      await service.getFeedback({
        status: 'RESOLVED',
        category: 'BROKEN_LINK',
        targetType: 'RESOURCE',
        careerId: 'career-1',
        page: 1,
        limit: 10,
      });

      const where = {
        status: 'RESOLVED',
        category: 'BROKEN_LINK',
        targetType: 'RESOURCE',
        careerId: 'career-1',
      };
      expect(mockPrismaService.contentFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 0, take: 10 }),
      );
      expect(mockPrismaService.contentFeedback.count).toHaveBeenCalledWith({
        where,
      });
    });

    it('maps each row to a Reports table item with the target title', async () => {
      const result = await service.getFeedback({ page: 1, limit: 20 });

      expect(result.items).toEqual([
        {
          id: 'feedback-1',
          category: 'BROKEN_LINK',
          section: 'RESOURCES',
          status: 'NEW',
          resolution: null,
          snippet: 'Step 2 course link is dead.',
          target: {
            type: 'CAREER',
            id: 'career-1',
            label: 'Software Engineer',
          },
          reporterEmail: 'ada@example.com',
          platform: 'WEB',
          createdAt,
        },
      ]);
    });

    it('looks up each target type once for the whole page and never for OTHER', async () => {
      mockPrismaService.contentFeedback.findMany.mockResolvedValue([
        row({ id: 'f1', targetType: 'CAREER', targetId: 'career-1' }),
        row({ id: 'f2', targetType: 'CAREER', targetId: 'career-2' }),
        row({ id: 'f3', targetType: 'CAREER', targetId: 'career-1' }),
        row({ id: 'f4', targetType: 'RESOURCE', targetId: 'resource-1' }),
        row({ id: 'f5', targetType: 'OTHER', targetId: null }),
        row({ id: 'f6', targetType: null, targetId: null }),
      ]);
      mockPrismaService.resource.findMany.mockResolvedValue([
        { id: 'resource-1', title: 'SQL course' },
      ]);

      await service.getFeedback({ page: 1, limit: 20 });

      expect(mockPrismaService.career.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['career-1', 'career-2'] } },
        select: { id: true, title: true },
      });
      expect(mockPrismaService.resource.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.pathway.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.pathwayStep.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.outlookData.findMany).not.toHaveBeenCalled();
    });

    it('makes no lookups when no report has a target', async () => {
      mockPrismaService.contentFeedback.findMany.mockResolvedValue([
        row({ targetType: 'OTHER', targetId: null }),
      ]);

      const result = await service.getFeedback({ page: 1, limit: 20 });

      expect(mockPrismaService.career.findMany).not.toHaveBeenCalled();
      expect(result.items[0].target).toEqual({
        type: 'OTHER',
        id: null,
        label: null,
      });
    });

    it('gives a null label when the target no longer exists', async () => {
      mockPrismaService.career.findMany.mockResolvedValue([]);

      const result = await service.getFeedback({ page: 1, limit: 20 });

      expect(result.items[0].target).toEqual({
        type: 'CAREER',
        id: 'career-1',
        label: null,
      });
    });

    it('labels a certification by its resource title and an outlook by place and period', async () => {
      mockPrismaService.contentFeedback.findMany.mockResolvedValue([
        row({ id: 'f1', targetType: 'CERTIFICATION', targetId: 'cert-1' }),
        row({ id: 'f2', targetType: 'OUTLOOK', targetId: 'outlook-1' }),
      ]);
      mockPrismaService.resource.findMany.mockResolvedValue([
        { id: 'cert-1', title: 'AWS Cloud Practitioner' },
      ]);
      mockPrismaService.outlookData.findMany.mockResolvedValue([
        { id: 'outlook-1', geography: 'United States', period: '2026' },
      ]);

      const result = await service.getFeedback({ page: 1, limit: 20 });

      expect(result.items.map((item) => item.target.label)).toEqual([
        'AWS Cloud Practitioner',
        'United States (2026)',
      ]);
    });
  });

  describe('updateFeedbackStatus', () => {
    it('updates the status and returns the updated record', async () => {
      const updated = { ...feedback, status: 'UNDER_REVIEW' as const };
      mockPrismaService.contentFeedback.update.mockResolvedValue(updated);

      const result = await service.updateFeedbackStatus('feedback-1', {
        status: 'UNDER_REVIEW',
      });

      expect(mockPrismaService.contentFeedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-1' },
        data: { status: 'UNDER_REVIEW' },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the feedback does not exist', async () => {
      mockPrismaService.contentFeedback.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateFeedbackStatus('missing', { status: 'RESOLVED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.contentFeedback.update.mockRejectedValue(failure);

      await expect(
        service.updateFeedbackStatus('feedback-1', { status: 'RESOLVED' }),
      ).rejects.toBe(failure);
    });
  });

  describe('assertTargetVisible', () => {
    const published = { status: 'PUBLISHED' };
    const publishedPathway = { pathway: { career: published } };

    const targets = [
      ['CAREER', 'career', { id: 'target-1', status: 'PUBLISHED' }],
      ['PATHWAY', 'pathway', { id: 'target-1', career: published }],
      [
        'PATHWAY_STAGE',
        'pathwayStage',
        { id: 'target-1', ...publishedPathway },
      ],
      ['PATHWAY_STEP', 'pathwayStep', { id: 'target-1', ...publishedPathway }],
      ['TASK', 'pathwayStepTask', { id: 'target-1', step: publishedPathway }],
      ['RESOURCE', 'resource', { id: 'target-1', status: 'ACTIVE' }],
      [
        'CERTIFICATION',
        'resource',
        { id: 'target-1', type: 'CERTIFICATION', status: 'ACTIVE' },
      ],
      ['OUTLOOK', 'outlookData', { id: 'target-1', career: published }],
    ] as const;

    it.each(targets)(
      'accepts a visible %s target',
      async (targetType, model, where) => {
        mockPrismaService[model].findFirst.mockResolvedValue({
          id: 'target-1',
        });

        await expect(
          service.assertTargetVisible(targetType, 'target-1'),
        ).resolves.toBeUndefined();

        expect(mockPrismaService[model].findFirst).toHaveBeenCalledWith({
          where,
          select: { id: true },
        });
        expect(warnSpy).not.toHaveBeenCalled();
      },
    );

    it.each(targets)(
      'rejects a %s target that is missing or not visible with 404',
      async (targetType, model) => {
        // The visibility rules are part of the query, so a draft, retired
        // or withdrawn target comes back as null, the same as a missing one.
        mockPrismaService[model].findFirst.mockResolvedValue(null);

        await expect(
          service.assertTargetVisible(targetType, 'target-1'),
        ).rejects.toThrow(new NotFoundException('Target not found'));

        expect(warnSpy).toHaveBeenCalledWith(
          { targetType, targetId: 'target-1', reason: 'TARGET_NOT_FOUND' },
          'Feedback rejected',
        );
      },
    );

    it.each([undefined, null, ''])(
      'rejects a target type that needs an id when targetId is %p',
      async (targetId) => {
        const error = await service
          .assertTargetVisible('CAREER', targetId)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainException);
        expect(error).toMatchObject({ code: 'TARGET_ID_REQUIRED' });
        expect((error as DomainException).getStatus()).toBe(400);
        expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
      },
    );

    it('needs no targetId and runs no lookup for OTHER', async () => {
      await expect(
        service.assertTargetVisible('OTHER'),
      ).resolves.toBeUndefined();
      await expect(
        service.assertTargetVisible('OTHER', 'anything'),
      ).resolves.toBeUndefined();

      for (const model of [
        mockPrismaService.career,
        mockPrismaService.pathway,
        mockPrismaService.pathwayStage,
        mockPrismaService.pathwayStep,
        mockPrismaService.pathwayStepTask,
        mockPrismaService.resource,
        mockPrismaService.outlookData,
      ]) {
        expect(model.findFirst).not.toHaveBeenCalled();
      }
    });

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.career.findFirst.mockRejectedValue(failure);

      await expect(
        service.assertTargetVisible('CAREER', 'target-1'),
      ).rejects.toBe(failure);
    });
  });

  describe('updateFeedback', () => {
    const changed = (
      status: 'NEW' | 'UNDER_REVIEW' | 'RESOLVED',
      resolution: 'FIXED' | 'NOT_AN_ISSUE' | null,
    ) => ({
      id: 'feedback-1',
      status,
      resolution,
      updatedAt: new Date('2026-11-12T10:00:00.000Z'),
    });

    it('sets the status and resolution together and returns the change', async () => {
      mockPrismaService.contentFeedback.update.mockResolvedValue(
        changed('RESOLVED', 'FIXED'),
      );

      const result = await service.updateFeedback('feedback-1', 'admin-1', {
        status: 'RESOLVED',
        resolution: 'FIXED',
      });

      expect(mockPrismaService.contentFeedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-1' },
        data: { status: 'RESOLVED', resolution: 'FIXED' },
        select: { id: true, status: true, resolution: true, updatedAt: true },
      });
      expect(result).toEqual(changed('RESOLVED', 'FIXED'));
    });

    it('clears the resolution when a report is reopened', async () => {
      mockPrismaService.contentFeedback.update.mockResolvedValue(
        changed('UNDER_REVIEW', null),
      );

      await service.updateFeedback('feedback-1', 'admin-1', {
        status: 'UNDER_REVIEW',
      });

      expect(mockPrismaService.contentFeedback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'UNDER_REVIEW', resolution: null },
        }),
      );
    });

    it('logs the feedback id, actor, status and resolution only', async () => {
      mockPrismaService.contentFeedback.update.mockResolvedValue(
        changed('RESOLVED', 'NOT_AN_ISSUE'),
      );

      await service.updateFeedback('feedback-1', 'admin-1', {
        status: 'RESOLVED',
        resolution: 'NOT_AN_ISSUE',
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        {
          feedbackId: 'feedback-1',
          actorId: 'admin-1',
          status: 'RESOLVED',
          resolution: 'NOT_AN_ISSUE',
        },
        'Feedback status changed',
      );
      const logged = JSON.stringify([logSpy.mock.calls, warnSpy.mock.calls]);
      expect(logged).not.toContain('ada@example.com');
      expect(logged).not.toContain('course link');
    });

    it.each([
      [
        'RESOLVED without a resolution',
        { status: 'RESOLVED' as const },
        'RESOLUTION_REQUIRED',
      ],
      [
        'a resolution on a status other than RESOLVED',
        { status: 'NEW' as const, resolution: 'FIXED' as const },
        'RESOLUTION_NOT_ALLOWED',
      ],
    ])(
      'rejects %s with a 400 and writes nothing',
      async (_label, input, code) => {
        const error = await service
          .updateFeedback('feedback-1', 'admin-1', input)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainException);
        expect(error).toMatchObject({ code });
        expect((error as DomainException).getStatus()).toBe(400);
        expect(mockPrismaService.contentFeedback.update).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          { feedbackId: 'feedback-1', actorId: 'admin-1', reason: code },
          'Feedback update rejected',
        );
      },
    );

    it('throws NotFoundException when the feedback does not exist', async () => {
      mockPrismaService.contentFeedback.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateFeedback('missing', 'admin-1', { status: 'NEW' }),
      ).rejects.toThrow(new NotFoundException('Feedback not found'));
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.contentFeedback.update.mockRejectedValue(failure);

      await expect(
        service.updateFeedback('feedback-1', 'admin-1', { status: 'NEW' }),
      ).rejects.toBe(failure);
    });
  });

  describe('addNote', () => {
    const note = {
      id: 'note-1',
      feedbackId: 'feedback-1',
      authorId: 'admin-1',
      body: 'Checked with the content team.',
      createdAt: new Date('2026-11-12T10:00:00.000Z'),
    };

    it('stores the note against the feedback and the author', async () => {
      mockPrismaService.feedbackNote.create.mockResolvedValue(note);

      const result = await service.addNote(
        'feedback-1',
        'admin-1',
        'Checked with the content team.',
      );

      expect(mockPrismaService.feedbackNote.create).toHaveBeenCalledWith({
        data: {
          feedbackId: 'feedback-1',
          authorId: 'admin-1',
          body: 'Checked with the content team.',
        },
        select: {
          id: true,
          feedbackId: true,
          authorId: true,
          body: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(note);
    });

    it('logs the feedback id and actor but never the body', async () => {
      mockPrismaService.feedbackNote.create.mockResolvedValue(note);

      await service.addNote(
        'feedback-1',
        'admin-1',
        'Checked with the content team.',
      );

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        { feedbackId: 'feedback-1', actorId: 'admin-1' },
        'Feedback note added',
      );
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain('content team');
    });

    it('throws NotFoundException when the feedback does not exist', async () => {
      mockPrismaService.feedbackNote.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.addNote('missing', 'admin-1', 'hello'),
      ).rejects.toThrow(new NotFoundException('Feedback not found'));
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.feedbackNote.create.mockRejectedValue(failure);

      await expect(
        service.addNote('feedback-1', 'admin-1', 'hello'),
      ).rejects.toBe(failure);
    });
  });
});
