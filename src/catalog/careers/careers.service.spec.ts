import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersService } from './careers.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CareerStatus,
  Demand,
  OutlookType,
  TargetLevel,
} from '../../generated/prisma/client';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RevisionStatus } from '../../generated/prisma/client';
import { AnalyticsService } from '../../analytics';
import { DomainException } from '../../common';
import type { CreateCareerDto } from './dto/create-career.dto';
import {
  adminCareerDetailSelect,
  adminCareerListSelect,
  buildAdminCareerWhere,
} from './admin-career-read';

describe('CareersService', () => {
  let service: CareersService;

  const mockPrismaService = {
    career: {
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
      delete: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    field: {
      findUnique: jest.fn<(args: unknown) => Promise<{ id: string } | null>>(),
    },
    userCareer: {
      createMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      findUnique:
        jest.fn<(args: unknown) => Promise<{ savedAt: Date } | null>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    pathwayStep: {
      count: jest.fn<(args: unknown) => Promise<number>>(),
    },
    careerResource: {
      count: jest.fn<(args: unknown) => Promise<number>>(),
    },
  };

  const mockAnalyticsService = {
    capture: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<CareersService>(CareersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicCareers', () => {
    const mockDbCareers = [
      {
        id: '1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
        iconKey: 'se-icon',
        targetLevels: [TargetLevel.STUDENT, TargetLevel.RECENT_GRAD],
        _count: { resources: 12 },
        pathway: { steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
      },
    ];

    const expectedSelect = {
      id: true,
      slug: true,
      title: true,
      description: true,
      iconKey: true,
      targetLevels: true,
      _count: { select: { resources: true } },
      pathway: { select: { steps: { select: { id: true } } } },
    };

    it('returns global totals plus cards without filters', async () => {
      mockPrismaService.career.findMany.mockResolvedValue(mockDbCareers);
      mockPrismaService.career.count.mockResolvedValue(7);
      mockPrismaService.pathwayStep.count.mockResolvedValue(57);
      mockPrismaService.careerResource.count.mockResolvedValue(141);

      const result = await service.getPublicCareers({});

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: { status: CareerStatus.PUBLISHED },
        select: expectedSelect,
        orderBy: { title: 'asc' },
      });
      expect(mockPrismaService.career.count).toHaveBeenCalledWith({
        where: { status: CareerStatus.PUBLISHED },
      });
      expect(mockPrismaService.pathwayStep.count).toHaveBeenCalledWith({
        where: {
          pathway: { career: { status: CareerStatus.PUBLISHED } },
        },
      });
      expect(mockPrismaService.careerResource.count).toHaveBeenCalledWith({
        where: { career: { status: CareerStatus.PUBLISHED } },
      });

      expect(result).toEqual({
        totals: { pathways: 7, topics: 57, resources: 141 },
        items: [
          {
            id: '1',
            slug: 'software-engineer',
            title: 'Software Engineer',
            description: 'Builds software applications.',
            iconKey: 'se-icon',
            targetLevels: [TargetLevel.STUDENT, TargetLevel.RECENT_GRAD],
            topicCount: 3,
            resourceCount: 12,
          },
        ],
      });
    });

    it('applies level + interest filters to items, not totals', async () => {
      mockPrismaService.career.findMany.mockResolvedValue([]);
      mockPrismaService.career.count.mockResolvedValue(7);
      mockPrismaService.pathwayStep.count.mockResolvedValue(57);
      mockPrismaService.careerResource.count.mockResolvedValue(141);

      const query: GetCareersQueryDto = {
        level: TargetLevel.RECENT_GRAD,
        interest: 'software-engineering',
      };
      const result = await service.getPublicCareers(query);

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: {
          status: CareerStatus.PUBLISHED,
          targetLevels: { has: TargetLevel.RECENT_GRAD },
          field: { slug: 'software-engineering' },
        },
        select: expectedSelect,
        orderBy: { title: 'asc' },
      });
      // Totals queries must NOT include the filter.
      expect(mockPrismaService.career.count).toHaveBeenCalledWith({
        where: { status: CareerStatus.PUBLISHED },
      });
      expect(result.totals).toEqual({
        pathways: 7,
        topics: 57,
        resources: 141,
      });
      expect(result.items).toEqual([]);
    });
  });

  describe('getPublishedCareerById', () => {
    const row = {
      title: 'Software Engineer',
      description: 'Builds software applications.',
      roleSummary: 'Designs and builds software systems.',
      exampleActivities: ['Write code', 'Review PRs'],
      imageUrl: 'https://cdn/banner.png',
      _count: { resources: 4 },
      pathway: { steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
      skills: [
        {
          importance: 'REQUIRED',
          skill: { id: 'skill-1', name: 'TypeScript' },
        },
      ],
      outlook: [
        {
          id: 'outlook-1',
          type: 'SALARY',
          geography: 'United States',
          sourceId: 'src-1',
          period: 'May 2024',
          median: { toString: () => '65000.00' },
          percentile25: null,
          percentile75: null,
          currency: 'USD',
          payPeriod: 'year',
          grossOrNet: 'gross',
          experienceLevel: 'entry-level',
          baseYear: null,
          baseValue: null,
          projectedYear: null,
          projectedValue: null,
          growthPercent: null,
          demandLevel: null,
        },
      ],
      resources: [
        {
          resource: {
            id: 'r1',
            title: 'TypeScript Deep Dive',
            provider: 'Coursera',
            url: 'https://example.com/course',
            type: 'COURSE',
            costStatus: 'FREE',
            estimatedWeeks: 6,
            badgeImageUrl: null,
          },
        },
        {
          resource: {
            id: 'r2',
            title: 'Certified SE',
            provider: 'IEEE',
            url: 'https://example.com/cert',
            type: 'CERTIFICATION',
            costStatus: 'PAID',
            estimatedWeeks: null,
            badgeImageUrl: 'https://cdn/badge.png',
          },
        },
      ],
    };

    it('returns overview, projection and requirements from a single query', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(row);

      const result = await service.getPublishedCareerById('career-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledTimes(1);
      const args = mockPrismaService.career.findFirst.mock.calls[0][0] as {
        where: { id: string; status: CareerStatus };
      };
      expect(args.where).toEqual({
        id: 'career-1',
        status: CareerStatus.PUBLISHED,
      });

      expect(result.overview).toEqual({
        title: 'Software Engineer',
        description: 'Builds software applications.',
        roleSummary: 'Designs and builds software systems.',
        exampleActivities: ['Write code', 'Review PRs'],
        imageUrl: 'https://cdn/banner.png',
        skills: [{ id: 'skill-1', name: 'TypeScript', importance: 'REQUIRED' }],
        topicCount: 3,
        resourceCount: 4,
      });
      expect(result.projection).toHaveLength(1);
      expect(result.projection[0].median).toBe('65000.00');
      expect(result.requirements.courses.map((r) => r.id)).toEqual(['r1']);
      expect(result.requirements.certifications.map((r) => r.id)).toEqual([
        'r2',
      ]);
      expect(result).not.toHaveProperty('field');
      expect(result.overview).not.toHaveProperty('field');
    });

    it('throws NotFoundException when nothing matches (draft, retired, or missing)', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(service.getPublishedCareerById('anything')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTargetLevels', () => {
    it('should return every target level as its string value', () => {
      const result = service.getTargetLevels();

      expect(result).toEqual(['STUDENT', 'RECENT_GRAD', 'EARLY_CAREER']);
    });

    it('should not query the database', () => {
      service.getTargetLevels();

      expect(mockPrismaService.career.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('createCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    const dto: CreateCareerDto = {
      title: 'DevOps Engineer',
      slug: 'devops-engineer',
      fieldId: 'field-1',
      description: 'Automates how software is built, tested and deployed.',
    };

    const createdAt = new Date('2026-10-28T10:30:00.000Z');
    const created = {
      id: 'career-1',
      slug: 'devops-engineer',
      title: 'DevOps Engineer',
      description: 'Automates how software is built, tested and deployed.',
      roleSummary: null,
      fieldId: 'field-1',
      targetLevels: [],
      status: CareerStatus.DRAFT,
      version: 1,
      createdAt,
      revisions: [
        { id: 'revision-1', status: RevisionStatus.DRAFT, baseVersion: 1 },
      ],
    };

    const prismaError = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('failed', {
        code,
        clientVersion: 'test',
      });

    beforeEach(() => {
      mockPrismaService.field.findUnique.mockResolvedValue({ id: 'field-1' });
      mockPrismaService.career.findFirst.mockResolvedValue(null);
      mockPrismaService.career.create.mockResolvedValue(created);
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('creates a DRAFT career at version 1 with its first DRAFT revision', async () => {
      await service.createCareer(dto, 'editor-1');

      expect(mockPrismaService.career.create).toHaveBeenCalledWith({
        data: {
          title: 'DevOps Engineer',
          slug: 'devops-engineer',
          description: 'Automates how software is built, tested and deployed.',
          roleSummary: null,
          fieldId: 'field-1',
          targetLevels: [],
          status: CareerStatus.DRAFT,
          version: 1,
          revisions: {
            create: {
              baseVersion: 1,
              createdById: 'editor-1',
              snapshot: {
                schemaVersion: 1,
                career: {
                  title: 'DevOps Engineer',
                  slug: 'devops-engineer',
                  description:
                    'Automates how software is built, tested and deployed.',
                  roleSummary: null,
                  fieldId: 'field-1',
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
              },
            },
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          roleSummary: true,
          fieldId: true,
          targetLevels: true,
          status: true,
          version: true,
          createdAt: true,
          revisions: { select: { id: true, status: true, baseVersion: true } },
        },
      });
    });

    it('passes the optional role summary and target levels through', async () => {
      await service.createCareer(
        {
          ...dto,
          roleSummary: 'Runs the delivery pipelines.',
          targetLevels: [TargetLevel.RECENT_GRAD],
        },
        'editor-1',
      );

      const [[args]] = mockPrismaService.career.create.mock.calls as [
        [
          {
            data: {
              roleSummary: string | null;
              targetLevels: TargetLevel[];
              revisions: {
                create: {
                  snapshot: {
                    career: {
                      roleSummary: string | null;
                      targetLevels: TargetLevel[];
                    };
                  };
                };
              };
            };
          },
        ],
      ];
      expect(args.data.roleSummary).toBe('Runs the delivery pipelines.');
      expect(args.data.targetLevels).toEqual([TargetLevel.RECENT_GRAD]);
      expect(args.data.revisions.create.snapshot.career).toEqual(
        expect.objectContaining({
          roleSummary: 'Runs the delivery pipelines.',
          targetLevels: [TargetLevel.RECENT_GRAD],
        }),
      );
    });

    it('returns the career with its revision and logs ids only', async () => {
      const result = await service.createCareer(dto, 'editor-1');

      expect(result).toEqual({
        id: 'career-1',
        slug: 'devops-engineer',
        title: 'DevOps Engineer',
        description: 'Automates how software is built, tested and deployed.',
        roleSummary: null,
        fieldId: 'field-1',
        targetLevels: [],
        status: CareerStatus.DRAFT,
        version: 1,
        createdAt,
        revision: {
          id: 'revision-1',
          status: RevisionStatus.DRAFT,
          baseVersion: 1,
        },
      });
      expect(logSpy).toHaveBeenCalledWith(
        {
          careerId: 'career-1',
          revisionId: 'revision-1',
          actorUserId: 'editor-1',
        },
        'Career draft created',
      );
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('checks title and slug ignoring case', async () => {
      await service.createCareer(dto, 'editor-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: { title: { equals: 'DevOps Engineer', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: { slug: { equals: 'devops-engineer', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('rejects an unknown field with FIELD_NOT_FOUND before checking names', async () => {
      mockPrismaService.field.findUnique.mockResolvedValue(null);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        {
          code: 'FIELD_NOT_FOUND',
          message: 'Field not found',
        },
      );
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.career.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          fieldId: 'field-1',
          actorUserId: 'editor-1',
          reason: 'FIELD_NOT_FOUND',
        },
        'Career draft rejected',
      );
    });

    it.each([
      [
        'title',
        { id: 'other' },
        null,
        'CAREER_TITLE_TAKEN',
        'A career with this title already exists',
      ],
      [
        'slug',
        null,
        { id: 'other' },
        'CAREER_SLUG_TAKEN',
        'A career with this slug already exists',
      ],
      [
        'title before slug',
        { id: 'other' },
        { id: 'another' },
        'CAREER_TITLE_TAKEN',
        'A career with this title already exists',
      ],
    ])(
      'rejects a taken %s with a 409 and creates nothing',
      async (_label, titleTaken, slugTaken, code, message) => {
        mockPrismaService.career.findFirst
          .mockResolvedValueOnce(titleTaken)
          .mockResolvedValueOnce(slugTaken);

        const error = await service
          .createCareer(dto, 'editor-1')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainException);
        expect(error).toMatchObject({ code, message });
        expect((error as DomainException).getStatus()).toBe(409);
        expect(mockPrismaService.career.create).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          { actorUserId: 'editor-1', reason: code },
          'Career draft rejected',
        );
      },
    );

    it('maps a unique violation from a concurrent create to the taken code', async () => {
      mockPrismaService.career.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'raced' });
      mockPrismaService.career.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        { code: 'CAREER_SLUG_TAKEN' },
      );
    });

    it('rethrows a unique violation it cannot attribute', async () => {
      const failure = prismaError('P2002');
      mockPrismaService.career.create.mockRejectedValue(failure);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toBe(failure);
    });

    it('maps a foreign key violation to FIELD_NOT_FOUND', async () => {
      mockPrismaService.career.create.mockRejectedValue(prismaError('P2003'));

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        { code: 'FIELD_NOT_FOUND' },
      );
    });

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.career.create.mockRejectedValue(failure);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toBe(failure);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    const notFound = () =>
      new Prisma.PrismaClientKnownRequestError('No record was found', {
        code: 'P2025',
        clientVersion: 'test',
      });

    beforeEach(() => {
      mockPrismaService.career.delete.mockResolvedValue({ id: 'career-1' });
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('deletes only a never-published draft that no user has saved', async () => {
      const result = await service.deleteCareer('career-1', 'admin-1');

      expect(mockPrismaService.career.delete).toHaveBeenCalledWith({
        where: {
          id: 'career-1',
          status: CareerStatus.DRAFT,
          publishedAt: null,
          userPathways: { none: {} },
        },
        select: { id: true },
      });
      expect(mockPrismaService.career.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Career deleted' });
    });

    it('logs the career and actor ids and emits career_deleted', async () => {
      await service.deleteCareer('career-1', 'admin-1');

      expect(logSpy).toHaveBeenCalledWith(
        { careerId: 'career-1', actorUserId: 'admin-1' },
        'Career deleted',
      );
      expect(mockAnalyticsService.capture).toHaveBeenCalledWith(
        'career_deleted',
        'admin-1',
        { careerId: 'career-1' },
      );
    });

    it('throws NotFoundException when no career has the id', async () => {
      mockPrismaService.career.delete.mockRejectedValue(notFound());
      mockPrismaService.career.findUnique.mockResolvedValue(null);

      await expect(service.deleteCareer('missing', 'admin-1')).rejects.toThrow(
        new NotFoundException('Career not found'),
      );
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    const publishedAt = new Date('2026-10-01T00:00:00.000Z');

    it.each([
      ['a published career', CareerStatus.PUBLISHED, publishedAt, 0],
      ['a retired career', CareerStatus.RETIRED, publishedAt, 3],
      ['a draft that was published before', CareerStatus.DRAFT, publishedAt, 0],
      ['a draft a user has saved', CareerStatus.DRAFT, null, 1],
    ] as const)(
      'throws ConflictException and warns with what blocked it for %s',
      async (_label, status, everPublishedAt, userPathways) => {
        mockPrismaService.career.delete.mockRejectedValue(notFound());
        mockPrismaService.career.findUnique.mockResolvedValue({
          status,
          publishedAt: everPublishedAt,
          _count: { userPathways },
        });

        await expect(
          service.deleteCareer('career-1', 'admin-1'),
        ).rejects.toThrow(
          new ConflictException(
            'Only a draft career that was never published or saved can be deleted',
          ),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          {
            careerId: 'career-1',
            actorUserId: 'admin-1',
            status,
            everPublished: everPublishedAt !== null,
            savedPathways: userPathways,
            reason: 'CAREER_HAS_HISTORY',
          },
          'Career delete rejected',
        );
        expect(logSpy).not.toHaveBeenCalled();
        expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
      },
    );

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.career.delete.mockRejectedValue(failure);

      await expect(service.deleteCareer('career-1', 'admin-1')).rejects.toBe(
        failure,
      );
      expect(mockPrismaService.career.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('listCareersForStaff', () => {
    it('applies the filter, the page window and newest-updated order, and returns the total', async () => {
      mockPrismaService.career.findMany.mockResolvedValue([{ id: 'c1' }]);
      mockPrismaService.career.count.mockResolvedValue(41);

      const result = await service.listCareersForStaff({
        status: CareerStatus.DRAFT,
        search: 'data',
        page: 3,
        limit: 10,
      });

      const where = buildAdminCareerWhere({
        status: CareerStatus.DRAFT,
        search: 'data',
      });
      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where,
        select: adminCareerListSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: 20,
        take: 10,
      });
      expect(mockPrismaService.career.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({
        items: [{ id: 'c1' }],
        total: 41,
        page: 3,
        limit: 10,
      });
    });

    it('does not restrict to PUBLISHED when no status is given', async () => {
      mockPrismaService.career.findMany.mockResolvedValue([]);
      mockPrismaService.career.count.mockResolvedValue(0);

      await service.listCareersForStaff({ page: 1, limit: 20 });

      expect(mockPrismaService.career.count).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('getCareerForStaff', () => {
    it('throws NotFoundException for an unknown career', async () => {
      mockPrismaService.career.findUnique.mockResolvedValue(null);

      await expect(service.getCareerForStaff('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('looks the career up by id with no status filter', async () => {
      mockPrismaService.career.findUnique.mockResolvedValue({
        id: 'c1',
        skills: [],
        outlook: [],
        pathway: null,
      });

      await service.getCareerForStaff('c1');

      expect(mockPrismaService.career.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: adminCareerDetailSelect,
      });
    });
  });

  describe('saveCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    const userId = 'user-1';
    const careerId = 'career-1';
    const savedAt = new Date('2026-11-09T10:00:00.000Z');

    beforeEach(() => {
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should insert the save, log it and return savedAt', async () => {
      mockPrismaService.career.findUnique.mockResolvedValue({
        status: CareerStatus.PUBLISHED,
      });
      mockPrismaService.userCareer.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userCareer.findUnique.mockResolvedValue({ savedAt });

      const result = await service.saveCareer(userId, careerId);

      expect(mockPrismaService.userCareer.createMany).toHaveBeenCalledWith({
        data: [{ userId, careerId }],
        skipDuplicates: true,
      });
      expect(result).toEqual({ careerId, savedAt });
      expect(logSpy).toHaveBeenCalledWith({ userId, careerId }, 'Career saved');
    });

    it('should return the existing savedAt without logging on a repeat save', async () => {
      mockPrismaService.career.findUnique.mockResolvedValue({
        status: CareerStatus.PUBLISHED,
      });
      mockPrismaService.userCareer.createMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userCareer.findUnique.mockResolvedValue({ savedAt });

      const result = await service.saveCareer(userId, careerId);

      expect(result).toEqual({ careerId, savedAt });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should return an existing save for a career retired after saving', async () => {
      mockPrismaService.career.findUnique.mockResolvedValue({
        status: CareerStatus.RETIRED,
      });
      mockPrismaService.userCareer.findUnique.mockResolvedValue({ savedAt });

      const result = await service.saveCareer(userId, careerId);

      expect(mockPrismaService.userCareer.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ careerId, savedAt });
    });

    it.each<[string, { status: CareerStatus } | null, string]>([
      ['unknown', null, 'CAREER_NOT_FOUND'],
      ['draft', { status: CareerStatus.DRAFT }, 'CAREER_NOT_PUBLISHED'],
      ['retired', { status: CareerStatus.RETIRED }, 'CAREER_NOT_PUBLISHED'],
    ])(
      'should reject a new save of a %s career with 404',
      async (_label, career, reason) => {
        mockPrismaService.career.findUnique.mockResolvedValue(career);
        mockPrismaService.userCareer.findUnique.mockResolvedValue(null);

        await expect(
          service.saveCareer(userId, careerId),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(mockPrismaService.userCareer.createMany).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          { userId, careerId, reason },
          'Career save rejected',
        );
      },
    );
  });

  describe('unsaveCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;

    beforeEach(() => {
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("should delete only the user's save and log it", async () => {
      mockPrismaService.userCareer.deleteMany.mockResolvedValue({ count: 1 });

      await service.unsaveCareer('user-1', 'career-1');

      expect(mockPrismaService.userCareer.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', careerId: 'career-1' },
      });
      expect(logSpy).toHaveBeenCalledWith(
        { userId: 'user-1', careerId: 'career-1' },
        'Career unsaved',
      );
    });

    it('should not log when there was no save', async () => {
      mockPrismaService.userCareer.deleteMany.mockResolvedValue({ count: 0 });

      await service.unsaveCareer('user-1', 'career-1');

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('listSavedCareers', () => {
    const savedAt = new Date('2026-11-09T10:00:00.000Z');
    const row = (
      status: CareerStatus,
      userPathways: { id: string }[] = [],
      overrides: Partial<{
        iconKey: string | null;
        targetLevels: TargetLevel[];
        resourceCount: number;
        steps: { id: string }[];
        pathway: null;
      }> = {},
    ) => ({
      savedAt,
      career: {
        id: 'career-1',
        slug: 'frontend-engineer',
        title: 'Frontend Engineer',
        description: 'Builds interfaces.',
        iconKey: overrides.iconKey ?? 'fe-icon',
        targetLevels: overrides.targetLevels ?? [TargetLevel.STUDENT],
        _count: { resources: overrides.resourceCount ?? 8 },
        pathway:
          overrides.pathway === null
            ? null
            : { steps: overrides.steps ?? [{ id: 's1' }, { id: 's2' }] },
        status,
        userPathways,
      },
    });

    it("queries only the user's saves of published or retired careers, newest first", async () => {
      mockPrismaService.userCareer.findMany.mockResolvedValue([]);

      await service.listSavedCareers('user-1');

      expect(mockPrismaService.userCareer.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          career: {
            status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
          },
        },
        orderBy: [{ savedAt: 'desc' }, { careerId: 'asc' }],
        select: {
          savedAt: true,
          career: {
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              iconKey: true,
              targetLevels: true,
              _count: { select: { resources: true } },
              pathway: { select: { steps: { select: { id: true } } } },
              status: true,
              userPathways: {
                where: { userId: 'user-1', isActive: true },
                select: { id: true },
              },
            },
          },
        },
      });
    });

    it('maps each save to the shared card shape plus savedAt and flags', async () => {
      mockPrismaService.userCareer.findMany.mockResolvedValue([
        row(CareerStatus.PUBLISHED, [{ id: 'up-1' }]),
      ]);

      const result = await service.listSavedCareers('user-1');

      expect(result).toEqual([
        {
          id: 'career-1',
          slug: 'frontend-engineer',
          title: 'Frontend Engineer',
          description: 'Builds interfaces.',
          iconKey: 'fe-icon',
          targetLevels: [TargetLevel.STUDENT],
          topicCount: 2,
          resourceCount: 8,
          savedAt,
          isActivePathway: true,
          isRetired: false,
        },
      ]);
    });

    it('flags a retired career and one that is not the active pathway', async () => {
      mockPrismaService.userCareer.findMany.mockResolvedValue([
        row(CareerStatus.RETIRED),
      ]);

      const [item] = await service.listSavedCareers('user-1');

      expect(item.isRetired).toBe(true);
      expect(item.isActivePathway).toBe(false);
    });

    it('returns topicCount 0 for a saved career with no pathway', async () => {
      mockPrismaService.userCareer.findMany.mockResolvedValue([
        row(CareerStatus.PUBLISHED, [], { pathway: null, resourceCount: 3 }),
      ]);

      const [item] = await service.listSavedCareers('user-1');

      expect(item.topicCount).toBe(0);
      expect(item.resourceCount).toBe(3);
    });

    it('uses the exact same card shape as getPublicCareers', async () => {
      mockPrismaService.userCareer.findMany.mockResolvedValue([
        row(CareerStatus.PUBLISHED),
      ]);

      const [savedItem] = await service.listSavedCareers('user-1');

      const cardOnly = (({
        savedAt: _s,
        isActivePathway: _a,
        isRetired: _r,
        ...rest
      }) => rest)(savedItem);

      expect(cardOnly).toEqual({
        id: 'career-1',
        slug: 'frontend-engineer',
        title: 'Frontend Engineer',
        description: 'Builds interfaces.',
        iconKey: 'fe-icon',
        targetLevels: [TargetLevel.STUDENT],
        topicCount: 2,
        resourceCount: 8,
      });
    });
  });
});
